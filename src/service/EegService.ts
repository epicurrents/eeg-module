/**
 * Epicurrents EEG signal service.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { INDEX_NOT_ASSIGNED } from '@epicurrents/core/dist/util'
import { GenericBiosignalService } from '@epicurrents/core'
import {
    type BiosignalDataService,
    type BiosignalHeaderRecord,
    type BiosignalResource,
    type MemoryManager,
    type SetupStudyResponse,
    type SignalCacheResponse,
    type StudyContext,
    type WorkerResponse,
} from '@epicurrents/core/dist/types'

//const SCOPE = "EegService"

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
        super (recording, worker, manager)
        this._worker?.addEventListener('message', this.handleMessage.bind(this))
    }

    async handleMessage (message: WorkerResponse) {
        const data = message.data
        if (!data) {
            return false
        }
        return (await super.handleMessage(message))
    }

    async setupWorker (header: BiosignalHeaderRecord, study: StudyContext, formatHeader?: unknown) {
        // Find the data file; there should only be one.
        const fileUrl = study.files.filter(
            f => f.modality === 'eeg' && f.role === 'data'
        ).map(file => file.url)[0]
        const commission = this._commissionWorker(
            'setup-worker',
            new Map<string, unknown>([
                ['header', header.serializable],
                ['url', fileUrl],
                ['formatHeader', formatHeader || null],
            ])
        )
        return commission.promise as Promise<SetupStudyResponse>
    }
}
