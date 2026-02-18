import EegRecording from '../src/EegRecording'

describe('EegRecording', () => {
    test('addSetup returns created setup and duplicate call returns existing (or errors if bug present)', () => {
        const header: any = { recordingStartTime: 0, dataUnitCount: 10, dataUnitDuration: 1 }
        const channels: any[] = [{ name: 'C3', label: 'C3', modality: 'eeg', averaged: false, samplingRate: 256, unit: 'uV', visible: true, sampleCount: 100 }]
        // fake worker
        const worker: any = { addEventListener: () => {} }
        const rec = new EegRecording('r', channels, header, worker)
        const setupConfig: any = { name: 's1' }
        const s1 = rec.addSetup(setupConfig, channels)
        expect(s1).not.toBeNull()
        // second call should return the existing setup
        const s2 = rec.addSetup(setupConfig, channels)
        expect(s2).toBe(s1)
    })
})
