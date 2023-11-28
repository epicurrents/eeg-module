/**
 * EpiCurrents EEG recording.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import {
    BiosignalMutex,
    GenericBiosignalHeaders,
    GenericBiosignalResource,
    SETTINGS,
} from "@epicurrents/core"
import {
    calculateSignalOffsets,
    secondsToTimeString,
    timePartsToShortString,
} from "@epicurrents/core/dist/util"
import {
    type ConfigBiosignalSetup,
    type ConfigMapChannels,
    type BiosignalAnnotation,
    type BiosignalChannel,
    type BiosignalConfig,
    type BiosignalMontage,
    type BiosignalMontageService,
    type MemoryManager,
    type StudyContext,
} from "@epicurrents/core/dist/types"
import EegService from "./service/EegService"
import EegSettings from "./config"
import { EegMontage, EegSetup, EegVideo } from "./components"
import { type EegResource } from "./types"
import { MutexExportProperties } from "asymmetric-io-mutex"
import Log from "scoped-ts-log"

const SCOPE = "EegRecording"
export default class EegRecording extends GenericBiosignalResource implements EegResource {
    protected _activeMontage: BiosignalMontage | null = null
    protected _dataProps: MutexExportProperties | null = null
    /** The display view start can be optionally updated here after signals are processed and actually displayed. */
    protected _displayViewStart: number = 0
    protected _formatHeader: object | null = null
    /** Header for this record (TODO: Other file types than EDF?) */
    protected _headers: GenericBiosignalHeaders
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
        headers: GenericBiosignalHeaders,
        fileWorker: Worker,
        loaderManager: MemoryManager,
        config = {} as BiosignalConfig
    ) {
        const EEG_SETTINGS = SETTINGS.modules.eeg as typeof EegSettings
        super(
            name,
            config?.sensitivity ||
                EEG_SETTINGS.sensitivity[
                    EEG_SETTINGS.sensitivityUnit as keyof typeof EEG_SETTINGS.sensitivity
                ].default,
            config?.type || 'eeg'
        )
        this.setMemoryManager(loaderManager)
        this._headers = headers
        if (config.formatHeader) {
            this._formatHeader = config.formatHeader
        }
        this._service = new EegService(this, fileWorker, loaderManager)
        this._startTime = headers.recordingStartTime
        this._dataDuration = headers.dataRecordCount*headers.dataRecordDuration
        this._totalDuration = this._dataDuration
        // Calculate channel offset properties.
        calculateSignalOffsets(channels, Object.assign({ isRaw: true, layout: [] }, EEG_SETTINGS))
        // Save sample counts and sampling rates (we need to pass these to the worker too).
        for (let i=0; i<channels.length; i++) {
            this._channels[i] = channels[i]
            // Save original sampling rate and sample count in case we do interpolation later.
            this._channels[i].originalSampleCount = channels[i].sampleCount
            this._channels[i].originalSamplingRate = channels[i].samplingRate
        }
        // Add default setup and montages.
        for (const setup of EEG_SETTINGS.defaultSetups) {
            this.addSetup(`default:${setup}`, channels)
            Log.debug(`Added setup default:${setup}.`, SCOPE)
            Log.debug(`Added raw signals montage for setup default:${setup}.`, SCOPE)
        }
        // Listen to is-active changes.
        this.addPropertyUpdateHandler('is-active', async () => {
            // Complete loader setup if not already done.
            if (this.isActive && !this._service.isReady) {
                // Calculate needed memory to load the entire recording.
                let totalMem = 4 // For lock field.
                const dataFieldsLen = BiosignalMutex.SIGNAL_DATA_POS
                for (const chan of channels) {
                    totalMem += chan.sampleCount + dataFieldsLen
                }
                // Let this happen in the background.
                this._service.requestMemory(totalMem).then(success => {
                    if (success) {
                        Log.debug(`Memory allocation complete.`, SCOPE)
                        this.setupBuffer().then((success) => {
                            Log.debug(`Buffer setup complete.`, SCOPE)
                            this.startCachingSignals()
                        })
                    } else {
                        Log.error(`Memory allocation failed.`, SCOPE)
                    }
                })
            } else if (!this.isActive) {
                //this.releaseBuffers()
            }
        })
    }
    get annotations () {
        return super.annotations
    }
    set annotations (annotations: BiosignalAnnotation[]) {
        const EEG_SETTINGS = SETTINGS.modules.eeg as typeof EegSettings
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
                    anno.id = replaceProps.id
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
    get hasVideo () {
        return (this._videos.length > 0)
    }
    get videos () {
        return this._videos
    }
    set videos (videos: any[]) {
        this._videos = videos
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////

    addAnnotation (annotation: BiosignalAnnotation) {
        this.annotations = [...this.annotations, annotation]
    }

    async addMontage (name: string, label: string, setup: EegSetup, config?: ConfigMapChannels) {
        if (this._service.bufferRangeStart === -1) {
            Log.error(`Cannot add a montage before buffer has been intialized.`, SCOPE)
            return null
        }
        const montage = new EegMontage(
            name, this, setup,
            this._memoryManager as MemoryManager,
            { label: label }
        )
        await montage.setupLoaderWithInputMutex(this._dataProps)
        if (config) {
            // Use config to add a montage.
            montage.mapChannels(config)
        } else if (!this._montages.length) {
            // Add first montage as an 'as recorded' montage.
            montage.mapChannels(null)
        } else {
            // Use default configuration.
            montage.mapChannels()
        }
        this._montages.push(montage)
        this.onPropertyUpdate('montages')
        return montage
    }

    addSetup (id: string, channels: BiosignalChannel[], config?: ConfigBiosignalSetup) {
        const setup = new EegSetup(id, channels, config)
        this._setups.push(setup)
        this.onPropertyUpdate('setups')
        if (!this._setup) {
            // Store common sampling rate.
            let sr = 0
            for (const chan of setup.channels) {
                if (chan.type === 'eeg') {
                    if (!sr) {
                        sr = chan.samplingRate
                    } else if (sr !== chan.samplingRate) {
                        sr = 0
                        break
                    }
                }
            }
            if (!sr) {
                this._samplingRate = null
            } else {
                this._samplingRate = sr
            }
            this.setup = setup
            this.onPropertyUpdate('sampling-rate')
        }
        return setup
    }

    getMainProperties () {
        const props = super.getMainProperties()
        if (this.isPrepared) {
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
        return props
    }

    async prepare () {
        const response = await this._service.prepareWorker(
            this._headers,
            this._source as StudyContext,
            this._formatHeader || undefined
        ).then(async response => {
            if (response) {
                this.totalDuration = response
                this.isPrepared = true
                return true
            }
            return false
        }).catch(e => {
            Log.error(`Failed to prepare a worker for the EEG recording.`, SCOPE, e)
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

    async setupBuffer (): Promise<boolean> {
        const success = await this._service.setupBuffer().then(async response => {
            if (response) {
                const EEG_SETTINGS = SETTINGS.modules.eeg as typeof EegSettings
                Log.debug(`Buffer for raw signal data initiated.`, SCOPE)
                this._dataProps = response
                for (const setup of this._setups) {
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
                return true
            } else {
                Log.error(`Buffer initialization failed.`, SCOPE)
                return false
            }
        }).catch(e => {
            console.error(e)
            return false
        })
        return success
    }
}
