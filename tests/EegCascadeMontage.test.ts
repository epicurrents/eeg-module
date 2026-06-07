import EegCascadeMontage from '../src/components/EegCascadeMontage'

const fakeSetup = (channels: Array<{ name: string, label: string, index: number, modality?: string, samplingRate?: number, unit?: string }>) => ({
    channels,
})

describe('EegCascadeMontage', () => {
    test('constructor sets timebase + page overrides from arguments', () => {
        const montage = new EegCascadeMontage(
            'cascade:ekg',
            {} as any,
            fakeSetup([]) as any,
            'EKG',
            10,
            30,
        )
        expect(montage.pageLength).toBe(30)
        expect(montage.pageStep).toBe(300)
        expect(montage.timebaseUnit).toBe('secPerPage')
    })

    test('mapChannels returns empty array and skips registration when source missing', () => {
        const montage = new EegCascadeMontage(
            'cascade:ekg',
            {} as any,
            fakeSetup([
                { name: 'F3', label: 'F3', index: 0 },
                { name: 'C3', label: 'C3', index: 1 },
            ]) as any,
            'EKG',
            10,
            30,
        )
        const mapped = montage.mapChannels()
        expect(Array.isArray(mapped)).toBe(true)
        expect(mapped.length).toBe(0)
    })

    test('mapChannels emits rowCount channels when source resolves by label', () => {
        const montage = new EegCascadeMontage(
            'cascade:ekg',
            {} as any,
            fakeSetup([
                { name: 'F3', label: 'F3', index: 0 },
                { name: 'EKG_x1', label: 'EKG', index: 7, modality: 'ekg', samplingRate: 256, unit: 'mV' },
            ]) as any,
            'EKG',
            10,
            30,
        )
        const mapped = montage.mapChannels()
        expect(mapped.length).toBe(10)
        // Every row points at the same source signal index — that's the cascade contract.
        for (const chan of mapped) {
            expect(chan.active).toBe(7)
        }
        // Each row carries a distinguishing 1-based suffix.
        expect(mapped[0].label).toBe('EKG 1')
        expect(mapped[9].label).toBe('EKG 10')
    })

    test('mapChannels resolves source by name when label fails', () => {
        const montage = new EegCascadeMontage(
            'cascade:resp',
            {} as any,
            fakeSetup([
                { name: 'RESP', label: 'Thoracic', index: 12, modality: 'res', samplingRate: 32, unit: 'au' },
            ]) as any,
            'RESP',
            5,
            60,
        )
        const mapped = montage.mapChannels()
        expect(mapped.length).toBe(5)
        expect(mapped[0].active).toBe(12)
    })

    test('getAllSignals slices the expanded-range source into rowCount equal pieces', async () => {
        const samplingRate = 100
        const pageLength = 2
        const rowCount = 5
        // Fabricate a source signal of rowCount * pageLength * samplingRate samples whose value
        // equals the sample index — easy to verify slice boundaries.
        const totalSamples = rowCount * pageLength * samplingRate
        const sourceData = new Float32Array(totalSamples)
        for (let i = 0; i < totalSamples; i++) {
            sourceData[i] = i
        }

        // Stub the recording's getAllRawSignals — the cascade montage bypasses the montage worker
        // and reads source bytes via this path on the recording. Stubbing it lets the test verify
        // the slice arithmetic without depending on a real cache / worker / SAB pipeline.
        const fakeRecording = {
            modality: 'eeg',
            getAllRawSignals: async () => ({
                start: 0,
                end: rowCount * pageLength,
                signals: [{ data: sourceData, samplingRate }],
            }),
        }
        const montage = new EegCascadeMontage(
            'cascade:ekg',
            fakeRecording as any,
            fakeSetup([
                { name: 'EKG', label: 'EKG', index: 0, modality: 'ekg', samplingRate, unit: 'mV' },
            ]) as any,
            'EKG',
            rowCount,
            pageLength,
        )
        montage.mapChannels()

        const response = await montage.getAllSignals([0, pageLength])
        expect(response).toBeTruthy()
        expect(response!.signals.length).toBe(rowCount)
        const samplesPerRow = pageLength * samplingRate
        for (let row = 0; row < rowCount; row++) {
            expect(response!.signals[row].samplingRate).toBe(samplingRate)
            expect(response!.signals[row].data.length).toBe(samplesPerRow)
            // First sample of row N should equal N * samplesPerRow under the index-fill stub.
            expect(response!.signals[row].data[0]).toBe(row * samplesPerRow)
            expect(response!.signals[row].data[samplesPerRow - 1]).toBe(row * samplesPerRow + samplesPerRow - 1)
        }
    })
})
