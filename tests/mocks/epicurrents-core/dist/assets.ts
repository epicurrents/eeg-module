// Minimal mock of @epicurrents/core/dist/assets used by eeg-module tests.
// Only the symbols EegRecording imports at construction time need to be present;
// behaviour is provided per-test via spies where it matters.
export class TrendService {
    isReady: boolean = false
    async setupWorker (..._args: any[]) {
        return null
    }
    async releaseSignalArrays () {
        return Promise.resolve()
    }
}
