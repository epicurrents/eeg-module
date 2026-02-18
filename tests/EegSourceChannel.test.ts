import EegSourceChannel from '../src/components/EegSourceChannel'

describe('EegSourceChannel', () => {
    test('determines laterality from name with number', () => {
        const ch = new EegSourceChannel('C3', 'C3', 'eeg', 0, false, 256, 'uV', true, {})
        // laterality is internal property _laterality
        expect((ch as any)._laterality).toBe('s')
    })
    test('determines laterality z from name ending with z', () => {
        const ch = new EegSourceChannel('Fz', 'Fz', 'eeg', 0, false, 256, 'uV', true, {})
        expect((ch as any)._laterality).toBe('z')
    })
})
