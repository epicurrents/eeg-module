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
import {
    calculateSignalOffsets,
    INDEX_NOT_ASSIGNED,
    secondsToTimeString,
    timePartsToShortString,
} from '@epicurrents/core/dist/util'
import type {
    AnnotationTemplate,
    ConfigBiosignalSetup,
    ConfigMapChannels,
    BiosignalAnnotation,
    BiosignalChannel,
    BiosignalConfig,
    BiosignalMontage,
    BiosignalMontageTemplate,
    BiosignalSetup,
    MemoryManager,
    StudyContext,
    SourceChannel,
} from '@epicurrents/core/dist/types'
import EegAnnotation from './components/EegAnnotation'
import EegService from './service/EegService'
import { EegMontage, EegSetup, EegSourceChannel, EegVideo } from './components'
import type { EegModuleSettings, EegResource } from './types'
import Log from 'scoped-event-log'

const SCOPE = "EegRecording"

// Build default setups.
const DEFAULTS = {} as {
    [setup: string]: {
        setup: ConfigBiosignalSetup
        montages: { [montage: string]: BiosignalMontageTemplate }
    }
}
import DEFAULT_1020 from '#config/defaults/10-20/setup.json'
import DEFAULT_1020_AVG from '#config/defaults/10-20/montages/avg.json'
import DEFAULT_1020_LON from '#config/defaults/10-20/montages/lon.json'
import DEFAULT_1020_REC from '#config/defaults/10-20/montages/rec.json'
import DEFAULT_1020_TRV from '#config/defaults/10-20/montages/trv.json'
DEFAULTS['default:10-20'] = {
    setup: DEFAULT_1020 as ConfigBiosignalSetup,
    montages: {
        avg: DEFAULT_1020_AVG as BiosignalMontageTemplate,
        lon: DEFAULT_1020_LON as BiosignalMontageTemplate,
        rec: DEFAULT_1020_REC as BiosignalMontageTemplate,
        trv: DEFAULT_1020_TRV as BiosignalMontageTemplate,
    },
}

// Additional montages.
const EXTRA = [] as { montage: BiosignalMontageTemplate, setup: string | BiosignalSetup }[]
import EXTRA_1020_LAPLACIAN from '#config/extra/montages/10-20-laplacian.json'
EXTRA.push({ montage: EXTRA_1020_LAPLACIAN as BiosignalMontageTemplate, setup: '10-20' })

/**
 * EEG recording resource.
 * @emits signal-caching-complete - When all signals have been cached from data source.
 */
export default class EegRecording extends GenericBiosignalResource implements EegResource {
    #SETTINGS = (window.__EPICURRENTS__?.RUNTIME?.SETTINGS.modules.eeg as EegModuleSettings) || null
    protected _activeMontage: BiosignalMontage | null = null
    /** The display view start can be optionally updated here after signals are processed and actually displayed. */
    protected _displayViewStart: number = 0
    protected _formatHeader: object | null = null
    /** Header information for this record. */
    protected _headers: GenericBiosignalHeader
    protected _montages: BiosignalMontage[] = []
    protected _setups: BiosignalSetup[] = []
    protected _videos: EegVideo[] = []

    /**
     * Create a new EegRecording.
     */
    constructor (
        name: string,
        channels: BiosignalChannel[],
        header: GenericBiosignalHeader,
        fileWorker: Worker,
        loaderManager?: MemoryManager,
        config = {} as BiosignalConfig
    ) {
        super(name, config?.modality || 'eeg')
        if (!this.#SETTINGS) {
            Log.error(`EEG settings not found in the global Epicurrents runtime.`, SCOPE)
        }
        this._headers = header
        if (loaderManager) {
            this.setMemoryManager(loaderManager)
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
        this._service = new EegService(this, fileWorker, loaderManager)
        this._startTime = header.recordingStartTime
        this._dataDuration = header.dataUnitCount*header.dataUnitDuration
        this._totalDuration = this._dataDuration
        // Listen to is-active changes.
        this.addEventListener(AssetEvents.ACTIVATE, async () => {
            // Complete loader setup if not already done.
            if (!this._service?.isReady && this._state === 'ready') {
                if (this._memoryManager) {
                    // Calculate needed memory to load the entire recording.
                    let totalMem = 4 // For lock field.
                    const dataFieldsLen = BiosignalMutex.SIGNAL_DATA_POS
                    for (const chan of channels) {
                        totalMem += chan.sampleCount + dataFieldsLen
                    }
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
                } else {
                    const dataCache = await this.setupCache()
                    if (!dataCache) {
                        Log.error(`Data cache setup failed.`, SCOPE)
                        this.state = 'error'
                        this.errorReason = 'Data cache setup failed'
                        this.isActive = false
                        return
                    }
                }
                // Add default setups and montages first as some of the extra montages may use them.
                await this.addDefaultSetupsAndMontages()
                // Add possible extra montages.
                for (const { montage, setup } of EXTRA) {
                    const setupLabel = typeof setup === 'string'
                                     ? `default:${setup}`
                                     : setup.name
                    await this.addMontage(
                        `${setupLabel}:${montage.label}`,
                        montage.label,
                        typeof setup === 'string' ? setupLabel : setup,
                        montage
                    )
                }
                await this.cacheSignals()
                this.dispatchEvent(BiosignalResourceEvents.SIGNAL_CACHING_COMPLETE)
            } else if (!this.isActive) {
                //this.releaseBuffers()
            }
        }, this.id)
        this.addEventListener(AssetEvents.DEACTIVATE, async () => {
            if (this.#SETTINGS?.unloadOnClose && this._service?.isReady) {
                await this.releaseBuffers()
            }
        }, this.id)
    }
    get annotations () {
        return super.annotations
    }
    set annotations (annotations: BiosignalAnnotation[]) {
        if (!this.#SETTINGS) {
            return
        }
        annotation_loop:
        for (let i=0; i<annotations.length; i++) {
            const anno = annotations[i]
            for (const ignorePat of this.#SETTINGS.annotations.ignorePatterns) {
                const patRegExp = new RegExp(ignorePat)
                if (anno.label.match(patRegExp)) {
                    annotations.splice(i, 1)
                    i--
                    continue annotation_loop
                }
            }
            for (const [convertPat, replaceProps] of this.#SETTINGS.annotations.convertPatterns) {
                const patRegExp = new RegExp(convertPat)
                if (anno.label.match(patRegExp)) {
                    anno.annotator = replaceProps.annotator || anno.annotator
                    anno.channels = replaceProps.channels
                    anno.class = replaceProps.class
                    anno.label = anno.label.replace(patRegExp, replaceProps.label)
                    anno.priority = replaceProps.priority
                    anno.text = replaceProps.text
                    anno.type = replaceProps.type
                    // Don't break after first, label may match multiple patterns.
                }
            }
        }
        super.annotations = annotations
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
    get videos () {
        return this._videos
    }
    set videos (videos: EegVideo[]) {
        this._videos = videos
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////

    addAnnotationsFromTemplates (...templates: AnnotationTemplate[]) {
        const annotations = [] as EegAnnotation[]
        for (const tpl of templates) {
            annotations.push(EegAnnotation.fromTemplate(tpl))
        }
        this.addAnnotations(...annotations)
    }

    async addDefaultSetupsAndMontages () {
        if (!this.#SETTINGS) {
            return
        }
        // Calculate raw channel offset properties.
        calculateSignalOffsets(this._channels, Object.assign({ isRaw: true, layout: [] }, this.#SETTINGS))
        // Add default setups and montages.
        for (const name of this.#SETTINGS.defaultSetups) {
            const template = DEFAULTS[name]?.setup
            if (!template) {
                Log.error(`Default setup '${name}' not found.`, SCOPE)
                continue
            }
            const setup = this.addSetup(template, this._channels)
            Log.debug(`Added default setup '${name}'.`, SCOPE)
            const montages = this.#SETTINGS.defaultMontages[
                setup.name as keyof EegModuleSettings['defaultMontages']
            ]
            for (const montage of montages) {
                const template = DEFAULTS[name]?.montages[montage[0]]
                const newMontage = await this.addMontage(`${setup.name}:${montage[0]}`, montage[1], setup, template)
                if (newMontage) {
                    Log.debug(`Added montage '${montage[0]}' for setup '${setup.name}'.`, SCOPE)
                }
            }
        }
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
            Log.error(`Cannot add a montage before buffer has been intialized.`, SCOPE)
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
            // Add new montage to the list.
            this._setPropertyValue('montages', [...this.montages, montage])
        }
        // Set up the proper data cache.
        if (this._mutexProps) {
            await montage.setupServiceWithInputMutex(this._mutexProps)
        } else if (this._cacheProps) {
            montage.setupServiceWithCache(this._cacheProps)
        }
        // Set data gaps.
        montage.setDataGaps(this._dataGaps)
        return montage
    }

    addSetup (config: ConfigBiosignalSetup, channels?: BiosignalChannel[]) {
        const existing = this._setups.find(s => s.name === config.name)
        if (existing) {
            Log.debug(`Setup '${name}' already exists.`, SCOPE)
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
        if (this.state === 'added') {
            props.set('Waiting to load...', null)
        } else if (this.state === 'error') {
            props.set(this._errorReason, null)
        } else if (this.state === 'loading') {
            props.set('Loading metadata...', null)
        } else if (this.state === 'loaded') {
            props.set('Initializing...', null)
        } else if (this.state === 'ready') {
            // Dependencies may still be loading.
            if (this._dependenciesMissing.length > 0) {
                const totalDeps = this._dependenciesMissing.length + this._dependenciesReady.length
                props.set(
                    'Loading dependency {n}/{t}...',
                    {
                        n: totalDeps - this._dependenciesMissing.length + 1,
                        t: totalDeps,
                    }
                )
            } else {
                props.set(
                    this._channels.length.toString(),
                    {
                        icon: 'wave',
                        n: this._channels.length,
                        title: '{n} signals'
                    }
                )
                const timeParts = secondsToTimeString(this._totalDuration, true) as number[]
                const timeShort = timePartsToShortString(timeParts)
                props.set(
                    timeShort,
                    {
                        icon: 'time',
                        t: secondsToTimeString(this._totalDuration) as string,
                        title: 'Duration: {t}',
                    }
                )
            }
        }
        return props
    }

    async prepare () {
        if (!this._service || this._state === 'error') {
            return false
        }
        const response = await this._service.setupWorker(
            this._headers,
            this._source as StudyContext,
            this._formatHeader || undefined
        ).then(async response => {
            if (response) {
                this.totalDuration = response
                this.state = 'ready'
                return true
            }
            // There was an error when preparing the resource.
            this._errorReason = 'Resource loading failed'
            this.state = 'error'
            return false
        }).catch(e => {
            Log.error(`Failed to prepare a worker for the EEG recording.`, SCOPE, e)
            this._errorReason = 'Resource loading failed'
            this.state = 'error'
            return false
        })
        // Load possible videos
        //if (study.meta.videos) {
        //    for (const { url, startTime, endTime, group, syncPoints } of study.meta.videos) {
        //        this._videos.push(new EegVideo(url, startTime, endTime, group, syncPoints))
        //    }
        //}
        return response
    }

    async releaseBuffers () {
        this.dispatchEvent(BiosignalResourceEvents.RELEASE_BUFFERS, 'before')
        await super.releaseBuffers()
        this._annotations.length = 0
        this._dataGaps.clear()
        this._videos.length = 0
        Log.debug(`All buffers released from ${this.name}`, SCOPE)
        this.dispatchEvent(BiosignalResourceEvents.RELEASE_BUFFERS, 'after')
    }
}
