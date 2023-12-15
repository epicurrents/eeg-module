/**
 * EpiCurrents EEG study loader.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { BiosignalStudyLoader, GenericBiosignalHeaders } from "@epicurrents/core"
import {
    type ConfigStudyContext,
    type BiosignalChannel,
    type ConfigStudyLoader,
    type FileFormatLoader,
    type FileSystemItem,
    type SafeObject,
    type StudyContext,
    type VideoAttachment,
} from "@epicurrents/core/dist/types"
import EegRecording from "../EegRecording"
import { type EegResource, type EegStudyProperties } from "../types"
//import EegRecording from "../EegRecording"
import Log from "scoped-ts-log"

const SCOPE = 'EegStudyLoader'

export default class EegStudyLoader extends BiosignalStudyLoader {

    constructor (name: string, contexts: string[], types: string[], loader: FileFormatLoader) {
        super(name, contexts, types, loader)
    }

    get resourceScope () {
        return 'eeg'
    }

    async getResource (idx: number | string = -1): Promise<EegResource | null> {
        const loaded = await super.getResource(idx)
        if (loaded) {
            return loaded as EegResource
        } else if (!this._study) {
            return null
        }
        // Create a new resource from the loaded study.
        const meta = this._study.meta as {
            channels?: BiosignalChannel[]
            formatHeader?: SafeObject
            header?: GenericBiosignalHeaders
        }
        if (!this._study.name || !meta || !meta.channels || !meta.header) {
            Log.error(
                `Cannot construct an EEG resoruce from given study context; it is missing required properties.`,
            SCOPE)
            return null
        }
        const worker = this._fileLoader?.getFileTypeWorker()
        if (!worker) {
            Log.error(`Study loader does not have a file worker.`, SCOPE)
            return null
        }
        if (!worker) {
            Log.error(`Study loader doesn't have a file type loader.`, SCOPE)
            return null
        }
        if (this._memoryManager) {
            const recording = new EegRecording(
                this._study.name,
                meta.channels,
                meta.header,
                worker,
                this._memoryManager,
                { formatHeader: meta.formatHeader }
            )
            recording.source = this._study
            this._resources.push(recording)
            // Clear the loaded study.
            this._study = null
            return recording
        }
        return null
    }

    public async loadFromDirectory (dir: FileSystemItem, config?: ConfigStudyLoader): Promise<StudyContext|null> {
        // Load the first file and add directory contents as study files.
        // Pass the directory name as default study name.
        const context = await super.loadFromDirectory(dir, config)
        if (context) {
            // Check for video attachments
            for (let i=0; i<context.files.length; i++) {
                if (context.files[i].type === 'video' || context.files[i].name.endsWith('.mp4')) {
                    null // TODO: Video handling?
                } else if (context.files[i].type === 'sig') {
                    context.files[0].type += `:eeg`
                }
            }
        }
        return context
    }

    public async loadFromUrl (
        fileUrl: string,
        config?: ConfigStudyLoader,
        preStudy?: StudyContext | undefined
    ): Promise<StudyContext | null> {
        const study = await super.loadFromUrl(fileUrl, config, preStudy)
        if (!study) {
            return null
        }
        study.type = 'eeg'
        if (study.files[0] && study.files[0].type === 'sig') {
            study.files[0].type = `eeg`
        }
        const meta = study.meta as EegStudyProperties
        if (meta.header.signals) {
            // Classify the channels.
            /* TODO: This doesn't actually do anything, was it supposed to be extended somehow?
            const settings = state.SETTINGS.modules.eeg as EegModuleSettings
            for (let i=0; i<meta.header.signals.length; i++) {
                let sigType = ''
                const channel = meta.header.signals[i]
                const label = channel.label
                if (!sigType) {
                    // See if signal type is EEG
                    for (const typeLbl of settings.labelMatchers.eeg) {
                        if (label.toLowerCase().indexOf(typeLbl.toLowerCase()) > -1) {
                            sigType = 'eeg'
                            break
                        }
                    }
                }
                if (!sigType) {
                    // See if signal type is EKG
                    for (const typeLbl of settings.labelMatchers.ekg) {
                        if (label.toLowerCase().indexOf(typeLbl.toLowerCase()) > -1) {
                            sigType = 'ekg'
                            break
                        }
                    }
                }
                if (!sigType) {
                    // See if signal type is EMG
                    for (const typeLbl of settings.labelMatchers.emg) {
                        if (label.toLowerCase().indexOf(typeLbl.toLowerCase()) > -1) {
                            sigType = 'emg'
                            break
                        }
                    }
                }
                if (!sigType) {
                    // See if signal type is EOG
                    for (const typeLbl of settings.labelMatchers.eog) {
                        if (label.toLowerCase().indexOf(typeLbl.toLowerCase()) > -1) {
                            sigType = 'eog'
                            break
                        }
                    }
                }
                if (!sigType) {
                    // See if signal type is respiration
                    for (const typeLbl of settings.labelMatchers.res) {
                        if (label.toLowerCase().indexOf(typeLbl.toLowerCase()) > -1) {
                            sigType = 'res'
                            break
                        }
                    }
                }
                if (!sigType) {
                    const physUnit = channel.physicalUnit.toLowerCase()
                    if (
                        // Physiological units
                        physUnit === 'uv' || physUnit === 'mv' || physUnit === 'v' ||
                        // Physical units
                        physUnit === 'bpm' ||
                        // Mathematical units
                        physUnit === '%'
                    ) {
                        // Generic signal
                        sigType = 'sig'
                    }
                }
            }
            */
        }
        return study
    }

    public async useStudy (study: StudyContext, config?: ConfigStudyContext) {
        const nextIdx = await super.useStudy(study, config)
        for (let i=0; i<study.files.length; i++) {
            const studyFile = study.files[i]
            // Go through additional file types.
            const urlEnd = studyFile.url.split('/').pop()
            const fName = config?.name || urlEnd || ''
            if (
                fName.endsWith('.mp4') || fName.endsWith('.m4v') || fName.endsWith('.webm')
            ) {
                // HTML5-compatible video file.
                // An EEG study can, in theory, contain only (a) video(s) of (an) episode(s).
                // Fetch the file name end as file format.
                const format = fName.split('.').pop() as string
                study.files.push({
                    file: null,
                    format: format,
                    mime: null,
                    name: fName,
                    partial: false,
                    range: [],
                    role: 'media',
                    type: 'video',
                    // Video files require a URL to play in the browser.
                    url: studyFile.url,
                })
                // Video files can be attachments, so only update study format and type if they are empty.
                if (!study.format) {
                    study.format = format
                }
                if (!study.type) {
                    study.type = 'video'
                }
                const meta = study.meta as { videos?: VideoAttachment[] }
                // Figuring out video duration requires creating a video element and preloading the metadata
                const loadVideoMeta = (study: StudyContext) => new Promise<number[]>((resolve, reject) => {
                    let video = null as HTMLVideoElement | null
                    try {
                        video = document.createElement('video')
                        video.preload = 'metadata'
                        video.onloadedmetadata = () => {
                            if (!video) {
                                return
                            }
                            // Save metadata before removing the element
                            const meta = [ video.duration ]
                            resolve(meta)
                        }
                        video.onerror = () => {
                            reject()
                        }
                        video.src = study.files[i].url
                    } catch (e) {
                        reject()
                    }
                    video?.remove() // Don't leave the video element dangling and consuming memory.
                })
                const [ duration ] = await loadVideoMeta(study) || [ 0 ]
                // Add the video as attachment and remove it from prime files.
                meta.videos?.push({
                    group: 0,
                    endTime: 0 + duration,
                    startTime: 0,
                    syncPoints: [],
                    url: study.files[i].url
                } as VideoAttachment)
                study.files.splice(i, 1)
                i-- // Prevent skipping over the next file.
            }
        }
        return nextIdx
    }
}
