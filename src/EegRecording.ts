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
import { AssetEvents } from '@epicurrents/core/dist/events'
import {
    calculateSignalOffsets,
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
    BiosignalMontageService,
    MemoryManager,
    StudyContext,
    SourceChannel,
} from '@epicurrents/core/dist/types'
import EegAnnotation from './components/EegAnnotation'
import EegService from './service/EegService'
import EegSettings from './config'
import { EegMontage, EegSetup, EegSourceChannel, EegVideo } from './components'
import type { EegResource } from './types'
import Log from 'scoped-event-log'

const SCOPE = "EegRecording"
export default class EegRecording extends GenericBiosignalResource implements EegResource {
    protected _activeMontage: BiosignalMontage | null = null
    /** The display view start can be optionally updated here after signals are processed and actually displayed. */
    protected _displayViewStart: number = 0
    protected _formatHeader: object | null = null
    /** Header for this record (TODO: Other file types than EDF?) */
    protected _headers: GenericBiosignalHeader
    protected _montageCaches : BiosignalMontageService[] =  []
    protected _montages: BiosignalMontage[] = []
    protected _recordMontage: BiosignalMontage | null = null
    protected _service: EegService
    protected _setups: EegSetup[] = []
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
        this._service = new EegService(this, fileWorker, loaderManager)
        this._startTime = header.recordingStartTime
        this._dataDuration = header.dataUnitCount*header.dataUnitDuration
        this._totalDuration = this._dataDuration
        // Listen to is-active changes.
        this.addEventListener(AssetEvents.ACTIVATE, async () => {
            // Complete loader setup if not already done.
            if (this.isActive && !this._service.isReady && this._state === 'ready') {
                if (this._memoryManager) {
                    // Calculate needed memory to load the entire recording.
                    let totalMem = 4 // For lock field.
                    const dataFieldsLen = BiosignalMutex.SIGNAL_DATA_POS
                    for (const chan of channels) {
                        totalMem += chan.sampleCount + dataFieldsLen
                    }
                    // Let memory allocation happen in the background.
                    this._service.requestMemory(totalMem).then(success => {
                        if (success) {
                            Log.debug(`Memory allocation complete.`, SCOPE)
                            this.setupMutex().then((success) => {
                                if (success) {
                                    Log.debug(`Buffer setup complete.`, SCOPE)
                                    this.addDefaultSetupsAndMontages()
                                    this.startCachingSignals()
                                }
                            })
                        } else {
                            Log.error(`Memory allocation failed.`, SCOPE)
                            this.state = 'error'
                            this.errorReason = 'Memory allocation failed'
                            this.isActive = false
                        }
                    })
                } else {
                    this.setupCache().then(result => {
                        if (result) {
                            this.addDefaultSetupsAndMontages()
                            this.startCachingSignals()
                        }
                    })
                }
            } else if (!this.isActive) {
                //this.releaseBuffers()
            }
        }, this.id)
    }
    get annotations () {
        return super.annotations
    }
    set annotations (annotations: BiosignalAnnotation[]) {
        if (!window.__EPICURRENTS__?.RUNTIME) {
            Log.error(`Reference to main application runtime was not found!`, SCOPE)
            return
        }
        const EEG_SETTINGS = window.__EPICURRENTS__.RUNTIME.SETTINGS.modules.eeg as typeof EegSettings
        annotation_loop:
        for (let i=0; i<annotations.length; i++) {
            const anno = annotations[i]
            for (const ignorePat of EEG_SETTINGS.annotations.ignorePatterns) {
                const patRegExp = new RegExp(ignorePat)
                if (anno.label.match(patRegExp)) {
                    annotations.splice(i, 1)
                    i--
                    continue annotation_loop
                }
            }
            for (const [convertPat, replaceProps] of EEG_SETTINGS.annotations.convertPatterns) {
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
        if (!window.__EPICURRENTS__?.RUNTIME) {
            Log.error(`Reference to main application runtime was not found, cannot perform setup.`, SCOPE)
            return
        }
        const EEG_SETTINGS = window.__EPICURRENTS__.RUNTIME.SETTINGS.modules.eeg as typeof EegSettings
        // Calculate raw channel offset properties.
        calculateSignalOffsets(this._channels, Object.assign({ isRaw: true, layout: [] }, EEG_SETTINGS))
        // Add default setups and montages.
        for (const name of EEG_SETTINGS.defaultSetups) {
            const setup = this.addSetup(`default:${name}`, this._channels)
            Log.debug(`Added setup default:${name}.`, SCOPE)
            Log.debug(`Added raw signals montage for setup default:${name}.`, SCOPE)
            const montages = EEG_SETTINGS.defaultMontages[
                setup.id.split(':')[1] as keyof typeof EEG_SETTINGS.defaultMontages
            ]
            for (const montage of montages) {
                if (montage[0].indexOf(':') === -1) {
                    const newMontage = await this.addMontage(`${setup.id}:${montage[0]}`, montage[1], setup)
                    if (newMontage) {
                        Log.debug(`Added montage ${montage[0]} for setup ${setup.id}.`, SCOPE)
                    }
                } else {
                    const newMontage = await this.addMontage(`default:${montage[0]}`, montage[1], setup)
                    if (newMontage) {
                        Log.debug(`Added montage ${montage[1]} for setup default:${montage[0]}.`, SCOPE)
                    }
                }
                if (this._recordMontage === null && this._montages.length) {
                    this._recordMontage = this._montages[0]
                }
            }
        }
    }

    async addMontage (name: string, label: string, setup: EegSetup, config?: ConfigMapChannels) {
        const getMontage = async () => {
            if (this._memoryManager && this._mutexProps) {
                if (this._service.bufferRangeStart === -1) {
                    Log.error(`Cannot add a montage before buffer has been intialized.`, SCOPE)
                    return null
                }
                const montage = new EegMontage(
                    name, this, setup,
                    this._memoryManager,
                    { label: label }
                )
                await montage.setupLoaderWithInputMutex(this._mutexProps)
                return montage
            }
            const montage = new EegMontage(
                name, this, setup,
                undefined,
                { label: label }
            )
            if (this._cacheProps) {
                montage.setupLoaderWithCache(this._cacheProps)
            }
            return montage
        }
        const montage = await getMontage()
        if (!montage) {
            return null
        }
        if (config) {
            // Use config to add a montage.
            montage.mapChannels(config)
        } else {
            // Use default configuration.
            montage.mapChannels()
        }
        montage.setDataGaps(this._dataGaps)
        this._setPropertyValue('montages', [...this.montages, montage])
        return montage
    }

    addSetup (id: string, channels: BiosignalChannel[], config?: ConfigBiosignalSetup) {
        const setup = new EegSetup(id, channels, config)
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
        if (this._state === 'error') {
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
        await super.releaseBuffers()
        this._activeMontage = null
        this._annotations.splice(0)
        this._annotations = []
        this._dataGaps.clear()
        Log.info(`All buffers released from ${this.name}`, SCOPE)
    }
}
