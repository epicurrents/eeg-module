import EegStudyLoader from '../src/loader/EegStudyLoader'

describe('EegStudyLoader', () => {
    test('resourceModality is eeg', () => {
        const loader = new EegStudyLoader('n', ['eeg'], {}, undefined)
        expect(loader.resourceModality).toBe('eeg')
    })

    test('loadFromUrl normalizes file modality', async () => {
        const loader = new EegStudyLoader('n', ['eeg'], {}, undefined)
        const study: any = { modality: 'x', files: [{ modality: 'signal' }] }
        const res = await (loader as any).loadFromUrl('u', undefined, study)
        expect(res).not.toBeNull()
        expect(res.modality).toBe('eeg')
        expect(res.files[0].modality).toBe('eeg')
    })
})
