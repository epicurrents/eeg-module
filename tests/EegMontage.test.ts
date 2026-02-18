import EegMontage from '../src/components/EegMontage'

describe('EegMontage', () => {
    test('mapChannels returns empty array when runtime missing', () => {
        // Ensure runtime is undefined
        // @ts-ignore
        delete (global as any).__EPICURRENTS__
        const montage = new EegMontage('m', {} as any, {} as any, undefined, undefined, undefined)
        const mapped = montage.mapChannels()
        expect(Array.isArray(mapped)).toBe(true)
        expect(mapped.length).toBe(0)
    })
})
