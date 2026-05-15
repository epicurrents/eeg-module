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
    FileFormatImporter,
    FileFormatExporter,
    SafeObject,
    StudyContext,
} from '@epicurrents/core/dist/types'
import EegRecording from '../EegRecording'
import type { EegResource } from '../types'
//import EegRecording from '../EegRecording'
import Log from 'scoped-event-log'

const SCOPE = 'EegStudyLoader'

export default class EegStudyLoader extends BiosignalStudyLoader {

    constructor (name: string, modalities: string[], importer: FileFormatImporter, exporter?: FileFormatExporter) {
        super(name, modalities, importer, exporter)
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
        const worker = this._studyImporter?.getFileTypeWorker('eeg')
        if (!worker) {
            Log.error(`Study loader does not have a file worker.`, SCOPE)
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
        // Check that we can display this resource within the available memory budget. Recordings
        // whose full decoded size exceeds `maxLoadCacheSize` are loaded via the rolling 3-block
        // cache (see `_buildDataBlocks` in `GenericSignalReader`); the resource is still openable
        // as long as three blocks plus per-channel mutex headers fit in the budget. Only when
        // even that minimum doesn't fit does this become a hard failure.
        let totalSamples = 0
        if (!window.__EPICURRENTS__?.RUNTIME) {
            // For TypeScript really.
            Log.error(`Reference to main application runtime was not found!`, SCOPE)
        } else {
            const appSettings = window.__EPICURRENTS__.RUNTIME.SETTINGS.app
            const blockDurationCap = appSettings.dataBlockDuration ?? 3600
            const maxCacheBytes = appSettings.maxLoadCacheSize
            let bytesPerSecond = 0
            for (const chan of meta.channels) {
                totalSamples += chan.sampleCount
                bytesPerSecond += chan.samplingRate * 4
            }
            // Mirror the adaptive block-duration computation in `EegRecording` and
            // `_buildDataBlocks`: 3 blocks of `blockDuration` must fit in ~95 % of the cache.
            const idealBlockDuration = bytesPerSecond > 0
                ? Math.floor(maxCacheBytes * 0.95 / (3 * bytesPerSecond))
                : blockDurationCap
            const ROLLING_BLOCK_FLOOR = 60
            const blockDuration = Math.max(
                ROLLING_BLOCK_FLOOR,
                Math.min(blockDurationCap, idealBlockDuration)
            )
            let rollingSamples = 0
            for (const chan of meta.channels) {
                rollingSamples += Math.min(
                    chan.sampleCount,
                    Math.ceil(3 * blockDuration * chan.samplingRate)
                )
            }
            if (4 * rollingSamples > maxCacheBytes) {
                // Even the floor-sized rolling cache won't fit. Cannot open the recording at all.
                Log.error(
                    [
                        `Recording's rolling cache (${(4 * rollingSamples / MB_BYTES).toFixed(2)} MiB at ` +
                        `${blockDuration} s blocks) exceeds maximum cache size ` +
                        `${(maxCacheBytes / MB_BYTES).toFixed(2)} MiB.`,
                        `Raise the app setting maxLoadCacheSize to open this recording.`
                    ],
                    SCOPE
                )
                recording.errorReason = `Rolling cache exceeds maximum memory budget.`
                recording.state = 'error'
            } else {
                if (4 * totalSamples > maxCacheBytes) {
                    Log.info(
                        `Recording size ${(4 * totalSamples / MB_BYTES).toFixed(2)} MiB exceeds cache ` +
                        `${(maxCacheBytes / MB_BYTES).toFixed(2)} MiB; opening via rolling cache ` +
                        `(${blockDuration} s blocks, ` +
                        `${(4 * rollingSamples / MB_BYTES).toFixed(2)} MiB working set).`,
                        SCOPE
                    )
                }
                recording.state = 'loaded'
            }
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
