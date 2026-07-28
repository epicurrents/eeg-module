/**
 * Epicurrents EEG recording.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import {
    BiosignalMutex,
    GenericBiosignalHeader,
    GenericBiosignalResource,
} from '@epicurrents/core'
import { AssetEvents, BiosignalResourceEvents } from '@epicurrents/core/dist/events'
import { TrendService } from '@epicurrents/core/dist/assets'
import { calculateSignalOffsets, INDEX_NOT_ASSIGNED } from '@epicurrents/core/dist/util'
import type {
    AnnotationEventTemplate,
    AnnotationLabelTemplate,
    BiosignalAnnotationEvent,
    BiosignalChannel,
    BiosignalConfig,
    BiosignalMontage,
    BiosignalMontageTemplate,
    BiosignalSetup,
    BiosignalTrendType,
    ConfigBiosignalSetup,
    ConfigMapChannels,
    MemoryManager,
    PropertyChangeContext,
    StudyContext,
    SourceChannel,
    UrlAccessOptions,
} from '@epicurrents/core/dist/types'
import EegEvent from './components/EegEvent'
import EegLabel from './components/EegLabel'
import EegService from './service/EegService'
import {
    EegAmplitudeIntegratedTrend,
    EegCascadeMontage,
    EegFrequencyRatioTrend,
    EegPdBsiTrend,
    EegSpectrogramTrend,
    EegMontage,
    EegSetup,
    EegSourceChannel,
    EegTrend,
    EegVideo,
} from './components'
import type { EegModuleSettings, EegResource } from './types'
import Log from 'scoped-event-log'

const SCOPE = "EegRecording"

import DEFAULT_1020 from '#config/defaults/10-20/setup.json'
import DEFAULT_1020_AVG from '#config/defaults/10-20/montages/avg.json'
import DEFAULT_1020_LON from '#config/defaults/10-20/montages/lon.json'
import DEFAULT_1020_REC from '#config/defaults/10-20/montages/rec.json'
import DEFAULT_1020_TRV from '#config/defaults/10-20/montages/trv.json'

// Additional montages.
import EXTRA_1020_CZREF from '#config/extra/montages/10-20-cz-ref.json'
import EXTRA_1020_LAPLACIAN from '#config/extra/montages/10-20-laplacian.json'

/**
 * EEG recording resource.
 */
export default class EegRecording extends GenericBiosignalResource implements EegResource {
    static readonly DEFAULT_MONTAGES = new Map<string, { setup: ConfigBiosignalSetup, montages: { [montage: string]: BiosignalMontageTemplate } }>([
        ['default:10-20', {
            setup: DEFAULT_1020 as ConfigBiosignalSetup,
            montages: {
                avg: DEFAULT_1020_AVG as BiosignalMontageTemplate,
                lon: DEFAULT_1020_LON as BiosignalMontageTemplate,
                rec: DEFAULT_1020_REC as BiosignalMontageTemplate,
                trv: DEFAULT_1020_TRV as BiosignalMontageTemplate,
            }
        }]
    ])
    static readonly EXTRA_MONTAGES = new Map<string, BiosignalMontageTemplate[]>([
        ['default:10-20', [
            EXTRA_1020_CZREF as BiosignalMontageTemplate,
            EXTRA_1020_LAPLACIAN as BiosignalMontageTemplate,
        ]],
    ])
    static readonly EXTRA_SETUPS = [] as ConfigBiosignalSetup[]
    /** A shorthand for accessing EEG module settings from the global runtime. */
    protected _SETTINGS = (window.__EPICURRENTS__?.RUNTIME?.SETTINGS.modules.eeg as EegModuleSettings) || null
    /** The display view start can be optionally updated here after signals are processed and actually displayed. */
    protected _displayViewStart: number = 0
    protected _formatHeader: object | null = null
    /** Header information for this record. */
    protected _headers: GenericBiosignalHeader
    /**
     * In-flight teardown started by deactivation, or `null` when no teardown is pending. The
     * `isActive` setter flips the active flag synchronously and runs {@link unload} in the
     * background; this holds that promise so {@link awaitDeactivation} can let a caller block on
     * the real release completing.
     */
    protected _pendingDeactivation: Promise<void> | null = null
    /** Tracks whether signal caching has completed at least once for this recording. */
    protected _signalCachingComplete = false
    /**
     * Set of trend types that have been explicitly requested via {@link ensureTrendSetup}.
     * Once a type is in this set every subsequent `_setupTrend` invocation proceeds regardless
     * of `autoCompute` — so montage changes and recompute requests always rebuild trends for
     * types the user has already opened. The on-demand semantics still hold: nothing happens
     * until the UI first requests setup for a given type.
     */
    protected _trendsEnabled = new Set<BiosignalTrendType>()
    /** Set when a `_setupTrend` call is already scheduled for the next microtask.
     *  Prevents double-computation when `SIGNAL_CACHING_COMPLETE` and the `activeMontage`
     *  property-change handler both fire in the same synchronous turn. */
    protected _trendSetupScheduled = false
    protected _setups: BiosignalSetup[] = []
    protected _videos: EegVideo[] = []
    /** Dedicated trend service — created on first activation, shared by all trends. */
    protected _trendService: import('@epicurrents/core/dist/types').BiosignalTrendService | null = null

    /**
     * Create a new EegRecording.
     */
    constructor (
        name: string,
        channels: BiosignalChannel[],
        header: GenericBiosignalHeader,
        fileWorker: Worker,
        memoryManager?: MemoryManager,
        config = {} as BiosignalConfig
    ) {
        super(name, config?.modality || 'eeg')
        if (!this._SETTINGS) {
            Log.error(`EEG settings not found in the global Epicurrents runtime.`, SCOPE)
        }
        this._headers = header
        if (memoryManager && this._SETTINGS?.useMemoryManager) {
            this.setMemoryManager(memoryManager)
        }
        if (config.formatHeader) {
            this._formatHeader = config.formatHeader
        }
        // Save sample counts and sampling rates (we need to pass these to the worker too).
        for (let i=0; i<channels.length; i++) {
            this._channels.push(new EegSourceChannel(
                channels[i].name,
                channels[i].label,
                channels[i].modality,
                i,
                channels[i].averaged,
                channels[i].samplingRate,
                channels[i].unit,
                channels[i].visible,
                channels[i]
            ))
        }
        // Service is set here and should only become null if the resource is destroyed.
        this._service = new EegService(this, fileWorker, this._memoryManager || undefined)
        // Forward reader-buffer moves to the trend worker. The trend worker's input views couple
        // directly to the reader's SAB region, but the trend service holds no managed allocation,
        // so a memory-manager rearrange cannot reach it through the managed-services loop — the
        // reader service announces its own move and the recording forwards it here.
        this._service.onPropertyChange('bufferRange', (newValue, oldValue) => {
            const newRange = newValue as number[] | null
            const oldRange = oldValue as number[] | null
            if (!this._trendService || !newRange || !oldRange) {
                return
            }
            const delta = newRange[0] - oldRange[0]
            if (!delta) {
                return
            }
            this._trendService.shiftInputPositions([
                { start: oldRange[0], end: oldRange[1], delta },
            ]).catch((e: unknown) => {
                Log.error(`Forwarding buffer move to the trend worker failed: ${(e as Error)?.message ?? e}.`, SCOPE)
            })
        }, this.id)
        this._startTime = header.recordingStartTime
        this._dataDuration = header.dataUnitCount*header.dataUnitDuration
        this._totalDuration = this._dataDuration
        // Listen to is-active changes.
        this.addEventListener(AssetEvents.ACTIVATE, async () => {
            // The ACTIVATE event fires for both 'before' and 'after' phases. Skip 'before':
            // _isActive is false then, so cacheSignals() would return immediately, and the
            // 'after' handler would see isReady=true (set by 'before' setup) and skip everything
            // — leaving the SAB initialized but never populated with actual signal data.
            if (!this._isActive) {
                return
            }
            // Complete loader setup if not already done. Note: no defensive
            // `signalCacheStatus = [0, 0]` reset here — `releaseSignalArrays` (Level 1 of
            // the cache lifecycle, called via `releaseBuffers` on close) drains all
            // in-flight `_readAndCachePart` chunks before its ack reaches the main thread,
            // so by the time this branch runs no stale `cache-signals` progress message
            // can land and bump the status back up. The reset that used to live here was
            // a band-aid for that race; the structural drain in `GenericSignalReader.
            // releaseSignalArrays` makes it unnecessary.
            if (!this._service?.isReady && this._state === 'ready') {
                this.dispatchEvent(EegRecording.EVENTS.INITIAL_SETUP, 'before')
                if (this._memoryManager) {
                    // Calculate needed memory. If the full recording fits in `maxLoadCacheSize`, allocate
                    // its full sample count per channel and use the static-cache path. Otherwise allocate
                    // only `3 × blockDuration` seconds per channel where `blockDuration` is computed
                    // adaptively to maximise block size within the cache budget. Mirrors the
                    // `_buildDataBlocks` computation on the worker side; both must agree on the value.
                    const appSettings = window.__EPICURRENTS__?.RUNTIME?.SETTINGS.app
                    const maxCacheBytes = appSettings?.maxLoadCacheSize ?? 0
                    const blockDurationCap = appSettings?.dataBlockDuration ?? 3600
                    let totalMem = 4 // For lock field.
                    const dataFieldsLen = BiosignalMutex.SIGNAL_DATA_POS
                    let fullSizeFloats = 0
                    let bytesPerSecond = 0
                    // Derivation cache slots participate in the budget exactly like source channels.
                    // `_derivationCacheSlots` was resolved when `_applyDefaultSetups` ran during
                    // `prepare()`, so by the time the ACTIVATE handler reaches here the setup (with
                    // its derivations) is already attached to `_setup`.
                    const derivationSlots = this._derivationCacheSlots()
                    for (const chan of channels) {
                        fullSizeFloats += chan.sampleCount
                        // Annotation channels (samplingRate 0) carry no signal bytes.
                        bytesPerSecond += chan.samplingRate * 4
                    }
                    for (const slot of derivationSlots) {
                        fullSizeFloats += slot.sampleCount
                        bytesPerSecond += slot.samplingRate * 4
                    }
                    const useRolling = (fullSizeFloats * 4) > maxCacheBytes
                    // Adaptive block duration: 3 × blockDuration seconds of channel data must fit
                    // inside ~95 % of the cache budget. Clamp to [60 s, dataBlockDuration cap]
                    // so a low cache budget still gets a workable (if small) block, and a huge
                    // budget stops growing past the configured ceiling.
                    const idealBlockDuration = bytesPerSecond > 0
                        ? Math.floor(maxCacheBytes * 0.95 / (3 * bytesPerSecond))
                        : blockDurationCap
                    const ROLLING_BLOCK_FLOOR = 60
                    const blockDuration = Math.max(
                        ROLLING_BLOCK_FLOOR,
                        Math.min(blockDurationCap, idealBlockDuration)
                    )
                    for (const chan of channels) {
                        const channelSamples = useRolling
                            ? Math.min(chan.sampleCount, Math.ceil(3 * blockDuration * chan.samplingRate))
                            : chan.sampleCount
                        totalMem += channelSamples + dataFieldsLen
                    }
                    for (const slot of derivationSlots) {
                        const slotSamples = useRolling
                            ? Math.min(slot.sampleCount, Math.ceil(3 * blockDuration * slot.samplingRate))
                            : slot.sampleCount
                        totalMem += slotSamples + dataFieldsLen
                    }
                    // TODO: Remove once rolling window cache is finalized.
                    Log.info(
                        `EegRecording memory request: useRolling=${useRolling} ` +
                        `maxCache=${maxCacheBytes}B cap=${blockDurationCap}s ideal=${idealBlockDuration}s ` +
                        `blockDur=${blockDuration}s fullSize=${fullSizeFloats * 4}B totalMem=${totalMem * 4}B`,
                        SCOPE
                    )
                    const memorySuccess = await this._service?.requestMemory(totalMem)
                    if (!memorySuccess) {
                        Log.error(`Memory allocation failed.`, SCOPE)
                        this.state = 'error'
                        this.errorReason = 'Memory allocation failed'
                        this.isActive = false
                        return
                    }
                    Log.debug(`Memory allocation complete.`, SCOPE)
                    const mutex = await this.setupMutex()
                    if (!mutex) {
                        Log.error(`Mutex setup failed.`, SCOPE)
                        this.state = 'error'
                        this.errorReason = 'Mutex setup failed'
                        this.isActive = false
                        return
                    }
                    Log.debug(`Buffer setup complete.`, SCOPE)
                    // For rolling-cache recordings, wire a viewStart listener that retriggers
                    // `cacheSignals` whenever the active view crosses out of the current middle
                    // block. The slide loads the new edge block while the user is still safely
                    // in the current middle; with orderly browsing, a block of cached data is
                    // always ready in the direction of motion. Non-rolling recordings load
                    // everything up-front and don't need the listener.
                    //
                    // **Prefetch hysteresis.** The slide trigger uses a half-block lookahead, so
                    // the window slides forward when the user is ~50 % into the current centre
                    // block (rather than when they cross into the next block). The new edge
                    // block then has roughly half a block's worth of user time to download
                    // before the user actually reaches it. Without this, with small cache
                    // budgets where the block duration hits the 60 s floor, page-by-page
                    // scrolling outpaces the block load and the renderer briefly sees an empty
                    // region past the cached range.
                    //
                    // **Serialisation.** Each slide takes the SAB write lock during
                    // `setSignalRange`'s data shift, so firing multiple concurrent slides starves
                    // the montage worker's read locks (manifests as `Maximum retries of locking
                    // operation reached` errors). When a new boundary crossing arrives while a
                    // slide is already running, we remember just the latest viewStart and run
                    // that single slide once the current one completes — intermediate crossings
                    // are intentionally dropped because the user has already moved past them.
                    if (useRolling) {
                        const lookahead = blockDuration*0.5
                        // Initialise to the prefetch-adjusted block at viewStart 0 so the listener
                        // doesn't fire spuriously the first time the viewer touches the property.
                        let lastTriggeredBlock = Math.floor(lookahead/blockDuration)
                        let slideInFlight: Promise<unknown> | null = null
                        let pendingViewStart: number | null = null
                        const runSlide = async (viewStart: number): Promise<void> => {
                            try {
                                await this._service?.cacheSignals(viewStart)
                            } finally {
                                slideInFlight = null
                                if (pendingViewStart !== null) {
                                    const next = pendingViewStart
                                    pendingViewStart = null
                                    slideInFlight = runSlide(next)
                                }
                            }
                        }
                        this.onPropertyChange('viewStart', () => {
                            // Compute the "effective" block as if the view were `lookahead` seconds
                            // ahead of its actual position. This pulls the slide trigger forward by
                            // half a block so the new edge block starts downloading while the user
                            // is still safely in the centre of the current one.
                            const prefetchStart = this._viewStart + lookahead
                            const prefetchBlock = Math.floor(prefetchStart/blockDuration)
                            if (prefetchBlock === lastTriggeredBlock) {
                                return
                            }
                            lastTriggeredBlock = prefetchBlock
                            // Pass the lookahead-adjusted position to `cacheSignals` so the worker
                            // centres the new window on the *next* block rather than the user's
                            // current one. Passing the unadjusted viewStart would resolve to the
                            // same block the window is already centred on, and `_slideToBlock`
                            // would no-op — that was the original bug where prefetch fired but
                            // never actually slid the window, so the user could still catch the
                            // cache before the next block loaded.
                            if (slideInFlight) {
                                pendingViewStart = prefetchStart
                            } else {
                                slideInFlight = runSlide(prefetchStart)
                            }
                        }, this.id)
                    }
                } else {
                    const dataCache = await this.setupCache()
                    if (!dataCache) {
                        Log.error(`Data cache setup failed.`, SCOPE)
                        this.state = 'error'
                        this.errorReason = 'Data cache setup failed'
                        this.isActive = false
                        return
                    }
                    Log.debug(`Data cache setup complete.`, SCOPE)
                }
                // Set up the dedicated trend service, connecting it to the EDF SAB.
                // Use the real worker when SAB is available, substitute otherwise.
                await this._initTrendService()
                // Default + extra setups are applied during `prepare()` (so derivations make it
                // into the memory budget). Montages need the SAB to be in place, so they happen
                // here, after setupMutex / setupCache.
                //
                // Montages added before the SAB existed were published without a worker cache:
                // the interface `created` lifecycle hook adds settings-sourced extra montages
                // (project setups such as BrainStatus) at resource creation, when `addMontage`
                // cannot commission the montage processor because no mutex/cache is available
                // yet. Snapshot them before applying defaults so we can wire exactly those below
                // — the montages `_applyDefaultMontages` adds are already wired by `addMontage`.
                const montagesAddedBeforeSetup = [...this.montages]
                await this._applyDefaultMontages()
                // Wire the pre-setup montages now that the mutex / cache is in place. This also
                // covers the case where `_applyDefaultMontages` returns early (skipDefaultSetups),
                // which is the project-viewer path where every montage comes from the `created`
                // hook — without this, activating one errors with "signal cache has not been set
                // up yet" because its worker-side processor was never commissioned.
                await this._wireMontageDataSources(montagesAddedBeforeSetup)
                // Initial setup complete.
                Log.debug(`EEG recording initial setup complete.`, SCOPE)
                this.dispatchEvent(EegRecording.EVENTS.INITIAL_SETUP, 'after')
                // Trends read raw EDF signals from the SAB directly — they are montage-independent.
                // Do NOT subscribe to activeMontage changes here; a montage switch must not trigger
                // a trend rebuild.
                //
                // Progressive computation: trends start as soon as the first full epoch is cached
                // and extend automatically as caching advances. Each signalCacheStatus change
                // either builds the trend objects (first time) or extends existing ones.
                this.onPropertyChange('signalCacheStatus', () => {
                    if (!this._trendService) {
                        return
                    }
                    // Forward interruptions whenever we have new ones — the processor needs
                    // them to map recording time → data time correctly for gap-containing files.
                    if (this._interruptions.size > 0) {
                        this._trendService.setInterruptions(this._interruptions)
                    }
                    const cachedEnd = this._signalCacheStatus[1]
                    if (this._trends.size === 0) {
                        // First epoch available — try to build trend objects now.
                        this._scheduleTrendSetup()
                    } else {
                        // Trends already exist — extend to cover newly cached signal.
                        this._extendTrendsToCache(cachedEnd)
                    }
                }, this.id)
                this.addEventListener(BiosignalResourceEvents.SIGNAL_CACHING_COMPLETE, () => {
                    this._signalCachingComplete = true
                    if (this._trendService) {
                        if (this._interruptions.size > 0) {
                            this._trendService.setInterruptions(this._interruptions)
                        }
                        // Final pass to catch any epochs between the last cache update
                        // and the true recording end.
                        this._extendTrendsToCache(this._signalCacheStatus[1])
                    }
                    // Schedule setup for the case where trends were not yet built
                    // (e.g. autoCompute=false and the user toggled the strip on late).
                    this._scheduleTrendSetup()
                }, this.id)
                const cacheOk = await this.cacheSignals()
                if (cacheOk === false) {
                    // `cacheSignals` returns false when the worker's cache fill
                    // returned early — typically because mutex setup left the
                    // cache "not ready" (e.g. SAB allocation succeeded but a
                    // downstream init step failed on a recording too large for
                    // the configured budget). Surfacing the failure on the
                    // resource lets the renderer fall out of its "Loading data"
                    // wait instead of hanging on signalCacheStatus = [0, 0].
                    // `announce` pipes the user-facing wording through the
                    // viewer's callout system (10 s toast by template default);
                    // the bare Log message stays terse for SIEM-style ingestion.
                    Log.error(
                        `Signal caching failed for ${this.name}.`,
                        SCOPE,
                        new Error(`Signal caching failed for ${this.name}.`),
                        {
                            announce:
                                `Could not load "${this.name}" — the recording may be ` +
                                `too large for the configured memory budget.`,
                        },
                    )
                    this._errorReason = this._errorReason || 'Signal caching failed'
                    this.state = 'error'
                }
                this.dispatchEvent(BiosignalResourceEvents.SIGNAL_CACHING_COMPLETE)
            }
        }, this.id)
    }
    get events () {
        return super.events
    }
    set events (events: BiosignalAnnotationEvent[]) {
        if (!this._SETTINGS) {
            return
        }
        annotation_loop:
        for (let i=0; i<events.length; i++) {
            const evt = events[i]
            for (const ignorePat of this._SETTINGS.events.ignorePatterns) {
                const patRegExp = new RegExp(ignorePat)
                if (evt.label.match(patRegExp)) {
                    events.splice(i, 1)
                    i--
                    continue annotation_loop
                }
            }
            for (const [convertPat, replaceProps] of this._SETTINGS.events.convertPatterns) {
                const patRegExp = new RegExp(convertPat)
                if (evt.label.match(patRegExp)) {
                    evt.annotator = replaceProps.annotator || evt.annotator
                    evt.channels = replaceProps.channels
                    evt.class = replaceProps.class
                    evt.label = evt.label.replace(patRegExp, replaceProps.label)
                    evt.priority = replaceProps.priority
                    evt.text = replaceProps.text
                    evt.type = replaceProps.type
                    // Don't break after first, label may match multiple patterns.
                }
            }
        }
        super.events = events
    }
    get channels () {
        return this._channels as SourceChannel[]
    }
    set channels (value: SourceChannel[]) {
        this._channels = value
    }
    get hasVideo () {
        return (this._videos.length > 0)
    }
    get isActive () {
        return this._isActive
    }
    set isActive (value: boolean) {
        // Check if disabling has side effects.
        if (this._SETTINGS?.unloadOnClose && this._service?.isReady) {
            // CRITICAL: flip `_isActive` synchronously BEFORE the async unload
            // kicks off, otherwise the runtime's `getActiveResource` iteration
            // can still see this recording as active during the brief (drain-
            // widened) window between "user clicks new" and "old's unload
            // completes" — and the newly-mounted EegViewer/EegPlot will then
            // capture *this* (about-to-be-released) resource as its RESOURCE
            // instead of the new one, leading to "signal cache has not been
            // set up yet" errors as soon as the release ack lands and nulls
            // the mutex. Synchronous flip means the iteration finds the new
            // recording correctly; unload runs in the background and any
            // listeners that care about the actual teardown completion can
            // subscribe to the service's `isReady` property change instead.
            const prev = this._isActive
            this.dispatchEvent(value ? AssetEvents.ACTIVATE : AssetEvents.DEACTIVATE, 'before')
            this.dispatchPropertyChangeEvent('isActive', value, prev, 'before')
            this._isActive = value
            this.dispatchPropertyChangeEvent('isActive', value, prev, 'after')
            this.dispatchEvent(value ? AssetEvents.ACTIVATE : AssetEvents.DEACTIVATE, 'after')
            // The synchronous flip above lets the runtime iteration see the new active resource
            // immediately, but the actual buffer release runs here in the background. Hold the
            // promise so `awaitDeactivation` can block a following allocation (the resource switch
            // under the memory manager) until this resource has finished releasing and rearranging
            // the shared buffer — otherwise the next recording's caching races the rearrange and
            // reads a moved/zeroed buffer region.
            const deactivation = this.unload().catch((e: unknown) => {
                Log.error(`Async unload failed: ${(e as Error)?.message ?? e}`, SCOPE)
            })
            this._pendingDeactivation = deactivation
            deactivation.finally(() => {
                // Only clear if a newer deactivation hasn't already replaced this one.
                if (this._pendingDeactivation === deactivation) {
                    this._pendingDeactivation = null
                }
            })
        } else {
            // Default to base class implementation.
            super.isActive = value
        }
    }
    get videos () {
        return this._videos
    }
    set videos (videos: EegVideo[]) {
        this._videos = videos
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////

    async awaitDeactivation () {
        await this._pendingDeactivation
    }

    /**
     * Public entry point for callers that want to ensure the aEEG trend is set up — typically the
     * UI when the user toggles the trend strip visible. If signal caching has already finished,
     * setup runs immediately. Otherwise the request is queued and the
     * {@link BiosignalResourceEvents.SIGNAL_CACHING_COMPLETE} handler will fulfil it once data is
     * available. Calling this before `activeMontage` is set is also safe; the activeMontage
     * property-change handler will retry.
     */
    /**
     * Request setup of the given trend type. Idempotent — once a type has been requested,
     * every subsequent `_buildAmplitudeTrends` call proceeds without further prompting.
     * Triggers immediately using whatever signal is already cached; the `signalCacheStatus`
     * listener then extends computation as more data arrives.
     */
    /**
     * Clear all previously-enabled trend types. Call before `ensureTrendSetup` when
     * switching trend types so that stale types don't cause unintended builds.
     */
    clearTrendTypes () {
        this._trendsEnabled.clear()
    }

    ensureTrendSetup (type: BiosignalTrendType = 'amplitude') {
        this._trendsEnabled.add(type)
        // Trigger immediately — _buildAmplitudeTrends now works on partial data,
        // so there is no reason to wait for SIGNAL_CACHING_COMPLETE.
        this._scheduleTrendSetup()
    }

    /**
     * Create and connect the dedicated trend service using the EDF reader's output SAB.
     * Trends require SharedArrayBuffer: `TrendProcessor` reads raw electrode signals
     * directly from the SAB. Silently skipped when SAB is unavailable.
     */
    protected async _initTrendService () {
        const cache = this.dataCache
        if (!cache || !('buffer' in cache)) {
            return
        }
        const service = new TrendService()
        // Per-channel modality list lets the trend worker restrict Common Average Reference
        // to EEG channels only. Without this, a single non-EEG channel (EKG, photic, status)
        // with rail-scale voltages dominates the mean and turns every derived signal into
        // essentially −CAR, collapsing the spectral asymmetry that ratio and pdBSI rely on.
        const signalModalities = this._channels.map(c => c.modality)
        const result = await service.setupWorker(
            cache as import('asymmetric-io-mutex').MutexExportProperties,
            this.dataDuration,
            this.totalDuration,
            'eeg',
            undefined,
            signalModalities,
        )
        if (result) {
            this._trendService = service
        }
    }

    protected _scheduleTrendSetup () {
        if (this._trendSetupScheduled) {
            return
        }
        this._trendSetupScheduled = true
        queueMicrotask(() => {
            this._trendSetupScheduled = false
            this._buildAmplitudeTrends()
            this._buildSpectrogramTrends()
            this._buildRatioTrends()
            this._buildPdBsiTrends()
        })
    }

    /**
     * Register a trend on this recording and kick off an initial computation up to
     * `initialCachedEnd` seconds. After that, `_extendTrendsToCache` drives subsequent
     * updates as more signal arrives.
     */
    protected _setupTrend (trend: EegTrend, initialCachedEnd: number) {
        // Remove any stale trend with the same name before re-adding.
        if (this.getTrend(trend.name)) {
            this.removeTrend(trend.name)
        }
        if (!this.addTrend(trend)) {
            return
        }
        // When a computation finishes, immediately check whether more signal has arrived
        // since we started — if so, queue the next chunk.
        trend.addEventListener('trend-complete', () => {
            Log.debug(`[trend] '${trend.name}' complete up to ${trend.computedUpToSec}s → extend to ${this._signalCacheStatus[1]}s`, SCOPE)
            this._extendTrendsToCache(this._signalCacheStatus[1])
        }, this.id)
        const epochLength = trend.epochLength
        const alignedEnd = Math.floor(initialCachedEnd / epochLength) * epochLength
        Log.debug(`[trend] _setupTrend '${trend.name}' epochLen=${epochLength}s initialCached=${initialCachedEnd}s alignedEnd=${alignedEnd}s`, SCOPE)
        if (alignedEnd >= epochLength) {
            trend.computeTrend([0, alignedEnd]).catch((error: unknown) => {
                Log.warn(`Initial compute of trend '${trend.name}' failed: ${error}`, SCOPE)
            })
        }
    }

    /**
     * Extend all registered trends to cover newly cached signal up to `cachedEndSec`.
     * Only computes complete epochs (aligned to epochLength); skips trends that are
     * already up to date or currently computing.
     */
    protected _extendTrendsToCache (cachedEndSec: number) {
        if (!this._trends.size) {
            return
        }
        for (const trend of this._trends.values()) {
            const epochLength = trend.epochLength
            const alignedEnd = Math.floor(cachedEndSec / epochLength) * epochLength
            Log.debug(`[trend] _extendTrendsToCache '${trend.name}' computing=${(trend as unknown as { _computing?: boolean })._computing} upTo=${trend.computedUpToSec}s → alignedEnd=${alignedEnd}s`, SCOPE)
            if (alignedEnd <= trend.computedUpToSec) {
                continue
            }
            trend.computeTrend([trend.computedUpToSec, alignedEnd]).catch((error: unknown) => {
                Log.warn(`Extend of trend '${trend.name}' failed: ${error}`, SCOPE)
            })
        }
    }

    /**
     * Override of `GenericBiosignalResource._constructCascadeMontage` so the EEG resource's `addCascadeMontage`
     * produces `EegCascadeMontage` instances — channels wrapped in `EegMontageChannel`, worker pinned to `eeg-montage`.
     */
    protected _constructCascadeMontage (
        name: string,
        setup: BiosignalSetup,
        sourceLabel: string,
        rowCount: number,
        pageLength: number,
        config?: { label: string },
    ) {
        return new EegCascadeMontage(
            name, this, setup, sourceLabel, rowCount, pageLength,
            this._memoryManager || undefined, config,
        )
    }

    async addCascadeMontagesFromEntries (entriesBySetup: {
        [setup: string]: {
            id: string,
            label: string,
            candidates: string[],
            rowCount: number,
            pageLength: number,
            sensitivity?: number,
            highpass?: number,
            lowpass?: number,
            notch?: number,
        }[]
    }) {
        if (!entriesBySetup || !this._setups.length) {
            return
        }
        for (const [setupName, entries] of Object.entries(entriesBySetup)) {
            const setup = this._setups.find(s => s.name === setupName)
            if (!setup) {
                Log.debug(
                    `Cascade montage setup '${setupName}' not found on this recording; skipping ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`,
                    SCOPE,
                )
                continue
            }
            for (const entry of entries) {
                const montageName = `cascade:${entry.id}`
                if (this.montages.find(m => m.name === montageName)) {
                    continue
                }
                // Pick the first candidate that matches a channel in the keyed setup.
                const chosenSource = entry.candidates.find(c => setup.channels.some(
                    chan => chan.name === c || chan.label === c
                ))
                if (!chosenSource) {
                    Log.debug(
                        `No cascade source resolved for '${entry.label}' in setup '${setupName}' from candidates [${entry.candidates.join(', ')}].`,
                        SCOPE,
                    )
                    continue
                }
                const created = await this.addCascadeMontage(
                    montageName,
                    entry.label,
                    setup,
                    chosenSource,
                    entry.rowCount,
                    entry.pageLength,
                )
                if (created) {
                    // Apply per-entry display defaults. Cascade montages have `applyToMontage`
                    // true so these values stay on the montage; reader sites surface them while
                    // the montage is active.
                    if (typeof entry.sensitivity === 'number') {
                        created.sensitivity = entry.sensitivity
                    }
                    if (typeof entry.highpass === 'number') {
                        await created.setHighpassFilter(entry.highpass)
                    }
                    if (typeof entry.lowpass === 'number') {
                        await created.setLowpassFilter(entry.lowpass)
                    }
                    if (typeof entry.notch === 'number') {
                        await created.setNotchFilter(entry.notch)
                    }
                    Log.debug(
                        `Added cascade montage '${entry.label}' for source '${chosenSource}' in setup '${setupName}'.`,
                        SCOPE,
                    )
                }
            }
        }
    }

    /**
     * Create and register `EegAmplitudeIntegratedTrend` objects for each entry in
     * `settings.aeeg.derivations` that can be resolved against the recording setup.
     * Computation starts immediately up to the currently cached signal end and is
     * extended automatically as caching progresses.
     */
    protected _buildAmplitudeTrends () {
        const settings = this._SETTINGS
        if (!settings?.aeeg || !this._setup) {
            return
        }
        if (!settings.aeeg.autoCompute && !this._trendsEnabled.has('amplitude')) {
            return
        }
        // Skip if amplitude trends already exist. Check the type explicitly so that
        // spectrogram (or other) trends already in the map don't block amplitude builds
        // — the two types can coexist briefly during a type switch.
        const hasAmplitude = [...this._trends.values()].some(t => t.derivation.type === 'amplitude')
        if (hasAmplitude) {
            return
        }
        const epochLength = settings.trends?.amplitude?.epochLength ?? 5
        if (!this._trendService) {
            Log.warn(`Cannot build trends: trend service not initialised yet.`, SCOPE)
            return
        }
        const cachedEnd = this._signalCacheStatus[1]
        if (cachedEnd < epochLength) {
            Log.debug(`Not enough signal cached yet (${cachedEnd}s < ${epochLength}s epoch); deferring trend setup.`, SCOPE)
            return
        }
        const service = this._trendService
        for (const entry of settings.aeeg.derivations) {
            const trend = new EegAmplitudeIntegratedTrend(
                `aeeg-${entry.id}`,
                entry.label,
                service,
                { epochLength }
            )
            const resolved = trend.tryResolveDerivation(this._setup, entry.candidates)
            if (!resolved) {
                Log.debug(`No aEEG candidate resolved for '${entry.label}'.`, SCOPE)
                continue
            }
            this._setupTrend(trend, cachedEnd)
        }
    }

    /**
     * Create and register `EegSpectrogramTrend` objects for each entry in
     * `settings.aeeg.derivations` (reuses the same L/R derivation candidates).
     * Follows the same progressive-caching pattern as `_buildAmplitudeTrends`.
     */
    protected _buildSpectrogramTrends () {
        const settings = this._SETTINGS
        const existingSpec = [...this._trends.values()].filter(t => t.derivation.type === 'spectrogram').map(t => t.name)
        Log.debug(`[trend] _buildSpectrogramTrends called — trendsEnabled=[${[...this._trendsEnabled]}] existing=[${existingSpec}] setup=${!!this._setup} trendService=${!!this._trendService} cachedEnd=${this._signalCacheStatus[1]}s`, SCOPE)
        if (!settings?.aeeg || !this._setup) {
            Log.debug(`[trend] _buildSpectrogramTrends early-exit: no aeeg settings or no setup`, SCOPE)
            return
        }
        if (!this._trendsEnabled.has('spectrogram')) {
            Log.debug(`[trend] _buildSpectrogramTrends early-exit: 'spectrogram' not in trendsEnabled`, SCOPE)
            return
        }
        if (existingSpec.length > 0) {
            Log.debug(`[trend] _buildSpectrogramTrends early-exit: already built [${existingSpec}]`, SCOPE)
            return  // already built
        }
        const specCfg  = (settings.trends as Record<string, unknown> & { spectrogram?: { epochLength?: number, maxFreqHz?: number, averageReference?: boolean } })?.spectrogram
        const epochLength = specCfg?.epochLength ?? 1
        const maxFreqHz   = specCfg?.maxFreqHz   ?? 30
        if (!this._trendService) {
            Log.warn(`Cannot build spectrogram trends: trend service not initialised yet.`, SCOPE)
            return
        }
        const cachedEnd = this._signalCacheStatus[1]
        if (cachedEnd < epochLength) {
            return
        }
        if (!(this._samplingRate ?? 0)) {
            Log.warn(`Cannot build spectrogram trends: input sampling rate unknown.`, SCOPE)
            return
        }
        // Fixed output bin count: one per Hz, matching maxFreqHz.
        // TrendProcessor aggregates raw FFT bins into these output bins so the
        // signal layout is epoch-length-independent (always maxFreqHz bins/epoch).
        const frequencyBins = maxFreqHz
        const averageReference = specCfg?.averageReference ?? false
        const service = this._trendService
        for (const entry of settings.aeeg.derivations) {
            const trend = new EegSpectrogramTrend(
                `spectrogram-${entry.id}`,
                entry.label,
                service,
                { epochLength, maxFreqHz, frequencyBins },
            )
            const resolved = trend.tryResolveDerivation(this._setup, entry.candidates, { averageReference })
            if (!resolved) {
                Log.debug(`No spectrogram candidate resolved for '${entry.label}'.`, SCOPE)
                continue
            }
            this._setupTrend(trend, cachedEnd)
        }
    }

    /**
     * Create and register `EegFrequencyRatioTrend` objects for each entry in
     * `settings.aeeg.derivations` (one trend per hemisphere using the same L/R
     * derivation candidates as aEEG). Follows the same progressive-caching pattern
     * as the other build hooks.
     */
    protected _buildRatioTrends () {
        const settings = this._SETTINGS
        if (!settings?.aeeg || !this._setup) {
            return
        }
        if (!this._trendsEnabled.has('ratio')) {
            return
        }
        const hasRatio = [...this._trends.values()].some(t => t.derivation.type === 'ratio')
        if (hasRatio) {
            return
        }
        const ratioCfg = settings.trends?.ratio
        const epochLength = ratioCfg?.epochLength ?? 2
        // Index-copy the band arrays into plain tuples. The settings store is a Vue
        // reactive Proxy and arrays on it are Proxy-wrapped — passing one through
        // postMessage triggers a DataCloneError because Proxies aren't structured-clonable.
        const numeratorBand: [number, number] = [
            ratioCfg?.numeratorBand?.[0] ?? 4,
            ratioCfg?.numeratorBand?.[1] ?? 8,
        ]
        const denominatorBand: [number, number] = [
            ratioCfg?.denominatorBand?.[0] ?? 8,
            ratioCfg?.denominatorBand?.[1] ?? 13,
        ]
        const averageReference = ratioCfg?.averageReference ?? true
        if (!this._trendService) {
            Log.warn(`Cannot build ratio trends: trend service not initialised yet.`, SCOPE)
            return
        }
        const cachedEnd = this._signalCacheStatus[1]
        if (cachedEnd < epochLength) {
            return
        }
        const service = this._trendService
        for (const entry of settings.aeeg.derivations) {
            const trend = new EegFrequencyRatioTrend(
                `ratio-${entry.id}`,
                entry.label,
                service,
                { epochLength, numeratorBand, denominatorBand },
            )
            const resolved = trend.tryResolveDerivation(this._setup, entry.candidates, { averageReference })
            if (!resolved) {
                Log.debug(`No ratio candidate resolved for '${entry.label}'.`, SCOPE)
                continue
            }
            this._setupTrend(trend, cachedEnd)
        }
    }

    /**
     * Create and register a single `EegPdBsiTrend` covering all configured homologous
     * electrode pairs (`settings.pdbsi.pairs`). One trend, one composite per-epoch value.
     */
    protected _buildPdBsiTrends () {
        const settings = this._SETTINGS
        if (!settings?.pdbsi || !this._setup) {
            return
        }
        if (!this._trendsEnabled.has('pdbsi')) {
            return
        }
        const hasPdbsi = [...this._trends.values()].some(t => t.derivation.type === 'pdbsi')
        if (hasPdbsi) {
            return
        }
        const mathCfg = settings.trends?.pdbsi
        const epochLength = mathCfg?.epochLength ?? 2
        // Same Proxy-cloning workaround as in `_buildRatioTrends`.
        const band: [number, number] = [
            mathCfg?.band?.[0] ?? 1,
            mathCfg?.band?.[1] ?? 4,
        ]
        const averageReference = mathCfg?.averageReference ?? true
        const pairs = settings.pdbsi.pairs
        if (!pairs?.length) {
            Log.debug(`Cannot build pdBSI trend: no pair config in settings.pdbsi.pairs.`, SCOPE)
            return
        }
        if (!this._trendService) {
            Log.warn(`Cannot build pdBSI trend: trend service not initialised yet.`, SCOPE)
            return
        }
        const cachedEnd = this._signalCacheStatus[1]
        if (cachedEnd < epochLength) {
            return
        }
        const trend = new EegPdBsiTrend(
            'pdbsi',
            'pdBSI',
            this._trendService,
            { epochLength, band },
        )
        const resolved = trend.tryResolvePairs(this._setup, pairs, { averageReference })
        if (!resolved) {
            Log.debug(`pdBSI trend: no configured pair resolves against the recording setup.`, SCOPE)
            return
        }
        this._setupTrend(trend, cachedEnd)
    }

    /**
     * Apply the deployment's default + extra setups to the recording. Runs from `prepare()` so
     * the setups (and their `SetupDerivation` entries) are attached before the resource is
     * activated and the SAB is sized — that lets the memory budgeter in the ACTIVATE handler
     * count derivation slots alongside source channels.
     *
     * Idempotent: `addSetup` already short-circuits on a name collision, so a second call to
     * `prepare()` is safe.
     */
    protected override async _applyDefaultSetups (): Promise<void> {
        if (!this._SETTINGS) {
            return
        }
        // Calculate raw channel offset properties. Setup-independent — runs even when default
        // setups are disabled.
        calculateSignalOffsets(this._channels, Object.assign({ isRaw: true, layout: [] }, this._SETTINGS))
        if (this._SETTINGS.skipDefaultSetups || !this._SETTINGS.defaultSetups?.length) {
            return
        }
        for (const name of this._SETTINGS.defaultSetups || []) {
            const template = EegRecording.DEFAULT_MONTAGES.get(name)?.setup
            if (!template) {
                Log.error(`Default setup '${name}' not found.`, SCOPE)
                continue
            }
            this.addSetup(template, this._channels)
            Log.debug(`Added default setup '${name}'.`, SCOPE)
        }
        for (const setup of EegRecording.EXTRA_SETUPS) {
            this.addSetup(setup, this._channels)
            Log.debug(`Added extra setup '${setup.name}'.`, SCOPE)
        }
    }

    /**
     * Apply default + extra montages to the recording. Runs from the ACTIVATE handler after the
     * SAB is in place — `addMontage` needs the worker mutex to commission the montage processor.
     */
    protected async _applyDefaultMontages (): Promise<void> {
        if (!this._SETTINGS || this._SETTINGS.skipDefaultSetups) {
            return
        }
        for (const name of this._SETTINGS.defaultSetups || []) {
            const setup = this._setups.find(s => s.name === name)
            if (!setup) {
                continue
            }
            const montages = this._SETTINGS.defaultMontages?.[
                setup.name as keyof EegModuleSettings['defaultMontages']
            ]
            for (const montage of montages || []) {
                const template = EegRecording.DEFAULT_MONTAGES.get(name)?.montages[montage[0]]
                const newMontage = await this.addMontage(`${setup.name}:${montage[0]}`, montage[1], setup, template)
                if (newMontage) {
                    Log.debug(`Added montage '${montage[0]}' for setup '${setup.name}'.`, SCOPE)
                    if (!this._recordMontage && montage[0] === 'rec') {
                        this._recordMontage = newMontage
                        Log.debug(`Set recording montage to '${newMontage.name}'.`, SCOPE)
                    }
                }
            }
        }
        for (const [setup, extraMontages] of EegRecording.EXTRA_MONTAGES) {
            for (const montage of extraMontages) {
                if (
                    this._setups.find(s => s.name === setup) &&
                    await this.addMontage(
                        `${setup}:${montage.name}`,
                        montage.label,
                        setup,
                        montage
                    )
                ) {
                    Log.debug(`Added extra montage '${montage.label}' for setup '${setup}'.`, SCOPE)
                }
            }
        }
    }

    /**
     * Wire each of the given montages' worker-side processors to the currently active signal
     * source — the SAB mutex when present, otherwise the JS-heap cache. Called from the ACTIVATE
     * handler for montages that were added before the SAB existed (e.g. via the interface
     * `created` lifecycle hook), which `addMontage` therefore published without a cache. A montage
     * is left untouched when neither a mutex nor a cache is available.
     */
    protected async _wireMontageDataSources (montages: BiosignalMontage[]): Promise<void> {
        for (const montage of montages) {
            if (this._mutexProps) {
                await montage.setupServiceWithInputMutex(this._mutexProps)
            } else if (this._cacheProps) {
                await montage.setupServiceWithCache(this._cacheProps)
            }
        }
    }

    addEventsFromTemplates (_context: PropertyChangeContext | null, ...templates: AnnotationEventTemplate[]) {
        const events = [] as EegEvent[]
        for (const tpl of templates) {
            events.push(EegEvent.fromTemplate(tpl))
        }
        this.addEvents({ source: 'system' }, ...events)
    }

    addLabelsFromTemplates (_context: PropertyChangeContext | null, ...templates: AnnotationLabelTemplate[]) {
        const labels = [] as EegLabel[]
        for (const tpl of templates) {
            labels.push(EegLabel.fromTemplate(tpl))
        }
        this.addLabels({ source: 'system' }, ...labels)
    }

    async addMontage (
        name: string,
        label: string,
        setup: BiosignalSetup | string,
        template?: BiosignalMontageTemplate,
        config?: ConfigMapChannels
    ) {
        let montage = this.montages.find(m => m.name === name) || null
        if (this._mutexProps && this._service?.bufferRangeStart === INDEX_NOT_ASSIGNED) {
            Log.error(`Cannot add a montage before buffer has been initialized.`, SCOPE)
            return null
        }
        if (montage) {
            Log.debug(`Montage '${name}' already exists.`, SCOPE)
        } else {
            if (typeof setup === 'string') {
                const cachedSetup = this._setups.find(s => s.name === setup)
                if (!cachedSetup) {
                    Log.error(`Setup ${setup} not found.`, SCOPE)
                    return null
                }
                setup = cachedSetup
            }
            montage = new EegMontage(
                name, this, setup,
                template,
                this._memoryManager || undefined,
                { label: label }
            )
            montage.mapChannels(config)
            // Set up the worker-side cache BEFORE publishing the montage on the
            // `montages` property. The property-change dispatch is synchronous
            // and fans out to Vue reactivity (EegViewer.montagesChanged →
            // setChannelLayout → channel property change → EegPlot.updateTraces
            // → getAllSignals). If we set the property first, those sync
            // listeners post `get-signals` to the (substitute or real) worker
            // before the `setup-cache` / `setup-input-mutex` commission has
            // even been queued — the worker's MontageProcessor `_cache` is
            // still `null`, getSignals errors with "signal cache has not been
            // set up yet", and the UI never paints. Awaiting setup here
            // serialises the commission round-trip and lets listeners see a
            // ready montage.
            // When neither is set the montage is being added before activation (e.g. the
            // interface `created` hook) — there is no SAB to wire yet. The ACTIVATE handler
            // wires such montages once the mutex/cache exists; see `montagesAddedBeforeSetup`.
            if (this._mutexProps) {
                await montage.setupServiceWithInputMutex(this._mutexProps)
            } else if (this._cacheProps) {
                await montage.setupServiceWithCache(this._cacheProps)
            }
            // Set interruptions before the property change too so any listener
            // that asks about gaps gets the same answer it would after a full
            // setup pass.
            montage.setInterruptions(this._interruptions)
            // Now publish to the world.
            this._setPropertyValue('montages', [...this.montages, montage])
            return montage
        }
        // Existing-montage path: cache may have been re-set up upstream
        // (mutex re-init), so still wire it.
        if (this._mutexProps) {
            await montage.setupServiceWithInputMutex(this._mutexProps)
        } else if (this._cacheProps) {
            await montage.setupServiceWithCache(this._cacheProps)
        }
        montage.setInterruptions(this._interruptions)
        return montage
    }

    addSetup (config: ConfigBiosignalSetup, channels?: BiosignalChannel[]) {
        const existing = this._setups.find(s => s.name === config.name)
        if (existing) {
            Log.debug(`Setup '${config.name}' already exists.`, SCOPE)
            return existing
        }
        const setup = new EegSetup(channels || this._channels, config)
        this._setups.push(setup)
        if (!this._setup) {
            // Store common sampling rate.
            let sr = 0
            for (const chan of setup.channels) {
                if (chan.modality === 'eeg') {
                    if (!sr && chan.samplingRate) {
                        sr = chan.samplingRate
                    } else if (sr !== chan.samplingRate) {
                        sr = 0
                        break
                    }
                }
            }
            if (!sr) {
                this._setPropertyValue('samplingRate', null)
            } else {
                this._setPropertyValue('samplingRate', sr)
            }
            this.setup = setup
        }
        return setup
    }

    getMainProperties () {
        const props = super.getMainProperties()
        if (props.size) {
            return props
        } else if (this.state === 'ready') {
            props.set('duration', this._totalDuration)
            props.set('signals', this._channels.length)
        }
        return props
    }

    async prepare (options?: UrlAccessOptions) {
        if (!this._service || this._state === 'error') {
            Log.error(`Cannot prepare the EEG recording, service is not available or is in error state.`, SCOPE)
            return false
        }
        const response = await this._service.setupWorker(
            this._headers,
            this._source as StudyContext,
            options,
            this._formatHeader || undefined
        ).then(async response => {
            if (response) {
                this.totalDuration = response
                return true
            }
            // There was an error when preparing the resource.
            this._errorReason = 'Setting up resource failed'
            this.state = 'error'
            return false
        }).catch(e => {
            Log.error(`Error when preparing the worker for the EEG recording.`, SCOPE, e)
            this._errorReason = 'Setting up resource failed'
            this.state = 'error'
            return false
        })
        if (response) {
            // Apply default + extra setups now, while the worker is ready but the resource is not
            // yet active. The activation-time memory budgeter walks `_setup.derivations` (declared
            // here) so derivation slots are sized into the SAB; if setup application waited until
            // ACTIVATE, those derivations would arrive after the SAB is locked.
            await this._applyDefaultSetups()
            // Flip to 'ready' only AFTER the setups are attached, so `state === 'ready'` (which makes
            // the resource `isReady`) truthfully implies the setups are in `_setups` — the ACTIVATE
            // handler's `_applyDefaultMontages` needs them, otherwise it silently adds zero montages
            // (the per-setup `continue`).
            this.state = 'ready'
            // The loader starts prepare() without awaiting it, and `setActiveResource` flips
            // `isActive` without checking `isReady`, so a recording can be activated *before* it is
            // prepared. The ACTIVATE handler then skips its one-time setup (its `state === 'ready'`
            // guard is false at that point) and nothing retriggers it — the recording opens with zero
            // montages, no channel offsets and no cached data, recovering only on reopen (by which
            // time `state === 'ready'`). Now that we are finally ready, re-dispatch ACTIVATE so the
            // setup runs; the handler's own guards make this a no-op once the service is set up.
            if (this._isActive && !this._service?.isReady) {
                Log.debug(`Recording activated before ready; running deferred setup.`, SCOPE)
                this.dispatchEvent(AssetEvents.ACTIVATE, 'after')
            }
        }
        // Load possible videos
        //if (study.meta.videos) {
        //    for (const { url, startTime, endTime, group, syncPoints } of study.meta.videos) {
        //        this._videos.push(new EegVideo(url, startTime, endTime, group, syncPoints))
        //    }
        //}
        return response
    }

    async releaseBuffers () {
        await super.releaseBuffers()
        this._events.length = 0
        this._interruptions.clear()
        this._labels.length = 0
        this._videos.length = 0
        Log.debug(`All buffers released from ${this.name}`, SCOPE)
    }
}
