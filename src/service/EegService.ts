/**
 * Epicurrents EEG signal service.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { INDEX_NOT_ASSIGNED } from '@epicurrents/core/dist/util'
import { GenericBiosignalService } from '@epicurrents/core'
import type {
    BiosignalDataService,
    BiosignalHeaderRecord,
    BiosignalResource,
    MemoryManager,
    SetupStudyResponse,
    SignalCacheResponse,
    StudyContext,
    UrlAccessOptions,
    WorkerResponse,
} from '@epicurrents/core/dist/types'
import { Log } from 'scoped-event-log'

const SCOPE = "EegService"

export default class EegService extends GenericBiosignalService implements BiosignalDataService {
    /** Resolved or rejected based on the success of data loading. */
    protected _getSignals: Promise<SignalCacheResponse> | null = null
    protected _signalBufferStart = INDEX_NOT_ASSIGNED

    get signalBufferStart () {
        return this._signalBufferStart
    }
    set signalBufferStart (value: number) {
        this._signalBufferStart = value
    }
    get worker () {
        return this._worker
    }

    constructor (recording: BiosignalResource, worker: Worker, manager?: MemoryManager) {
        super(recording, worker, manager)
        this._worker?.addEventListener('message', this.handleMessage.bind(this))
    }

    async handleMessage (message: WorkerResponse) {
        const data = message.data
        if (!data) {
            return false
        }
        return (await super.handleMessage(message))
    }

    async setupWorker (
        header: BiosignalHeaderRecord,
        study: StudyContext,
        options?: UrlAccessOptions,
        formatHeader?: unknown
    ) {
        // Find the data file; there should only be one.
        const dataFile = study.files.filter(f => f.modality === 'eeg' && f.role === 'data')[0]
        const fileUrl = dataFile?.url
        // A study opened from the local file system carries the File itself alongside the object URL
        // that was minted for it. Hand the File to the worker so part reads slice it directly: the
        // URL is a `blob:` reference to the very same bytes, and reading it back through the fetch
        // stack copies every requested range for nothing.
        const sourceFile = dataFile?.file || null
        // Snapshot the main thread's app settings so the worker starts with the same configured
        // values rather than the bundled defaults. The worker's `_buildDataBlocks` decides
        // `_useRolling` from `maxLoadCacheSize` and `dataBlockDuration`; if those don't match the
        // main thread's, the mutex layout it computes won't fit the allocated SAB slice.
        const appSettings = window.__EPICURRENTS__?.RUNTIME?.SETTINGS?.app
        const settingsApp = appSettings ? {
            dataBlockDuration: appSettings.dataBlockDuration,
            dataChunkSize: appSettings.dataChunkSize,
            logThreshold: appSettings.logThreshold,
            maxDirectLoadSize: appSettings.maxDirectLoadSize,
            maxLoadCacheSize: appSettings.maxLoadCacheSize,
            signalLoadingYieldMs: appSettings.signalLoadingYieldMs,
            useMemoryManager: appSettings.useMemoryManager,
        } : null
        try {
            const commission = this._commissionWorker(
                'setup-worker',
                new Map<string, unknown>([
                    ['header', header.serializable],
                    ['url', fileUrl],
                    ['file', sourceFile],
                    ['authHeader', options?.authHeader || null],
                    ['formatHeader', formatHeader || null],
                    ['settingsApp', settingsApp],
                ])
            )
            return commission.promise as Promise<SetupStudyResponse>
        } catch (e: unknown) {
            Log.error(`Error setting up worker: ${(e as Error).message}.`, SCOPE)
            return 0
        }
    }
}
