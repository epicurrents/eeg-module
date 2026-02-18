import EegMontageChannel from '../src/components/EegMontageChannel'

describe('EegMontageChannel', () => {
    test('can be constructed', () => {
        const ch = new EegMontageChannel({}, 'C3', 'C3', 'eeg', 1, {}, false, 256, 'uV', true, {})
        expect(ch).toBeInstanceOf(EegMontageChannel)
        expect((ch as any).name).toBe('C3')
    })
})
