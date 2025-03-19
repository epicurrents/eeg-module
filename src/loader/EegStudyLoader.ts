/**
 * Epicurrents EEG study loader.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { BiosignalStudyLoader, GenericBiosignalHeader } from '@epicurrents/core'
import { MB_BYTES } from '@epicurrents/core/dist/util'
import type {
    BiosignalChannel,
    ConfigStudyLoader,
    FileFormatReader,
    SafeObject,
    StudyContext,
} from '@epicurrents/core/dist/types'
import EegRecording from '../EegRecording'
import type { EegResource } from '../types'
//import EegRecording from '../EegRecording'
import Log from 'scoped-event-log'

const SCOPE = 'EegStudyLoader'

export default class EegStudyLoader extends BiosignalStudyLoader {

    constructor (name: string, modalities: string[], loader: FileFormatReader) {
        super(name, modalities, loader)
    }

    get resourceModality () {
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
            header?: GenericBiosignalHeader
        }
        if (!this._study.name || !meta || !meta.channels || !meta.header) {
            Log.error(
                `Cannot construct an EEG resource from given study context; it is missing required properties.`,
            SCOPE)
            return null
        }
        const worker = this._fileReader?.getFileTypeWorker()
        if (!worker) {
            Log.error(`Study loader does not have a file worker.`, SCOPE)
            return null
        }
        if (!worker) {
            Log.error(`Study loader doesn't have a file type loader.`, SCOPE)
            return null
        }
        const recording = new EegRecording(
            this._study.name,
            meta.channels,
            meta.header,
            worker,
            this._memoryManager || undefined,
            { formatHeader: meta.formatHeader }
        )
        // Check that we can display this resource using Float32Arrays.
        let totalSamples = 0
        for (const chan of meta.channels) {
            totalSamples += chan.sampleCount
        }
        if (!window.__EPICURRENTS__?.RUNTIME) {
            // For TypeScript really.
            Log.error(`Reference to main application runtime was not found!`, SCOPE)
        } else if (4*totalSamples > window.__EPICURRENTS__.RUNTIME.SETTINGS.app.maxLoadCacheSize) {
            Log.error(
                [
                    `Decoded file size ${(4*totalSamples/MB_BYTES).toFixed(2)} Mib exceeds maximum cache size ` +
                    `${(window.__EPICURRENTS__.RUNTIME.SETTINGS.app.maxLoadCacheSize/MB_BYTES).toFixed(2)} MiB.`,
                    `The limit for maximum cache size can be changed with the app setting maxLoadCacheSize.`
                ],
                SCOPE
            )
            recording.errorReason = `File size is too large.`
            recording.state = 'error'
        } else {
            recording.state = 'loaded'
        }
        recording.source = this._study
        this._resources.push(recording)
        // Clear the loaded study.
        this._study = null
        return recording
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
        study.modality = 'eeg'
        if (study.files[0] && study.files[0].modality === 'signal') {
            study.files[0].modality = `eeg`
        }
        return study
    }
}
