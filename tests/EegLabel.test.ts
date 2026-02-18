import EegLabel from '../src/components/EegLabel'

describe('EegLabel', () => {
    test('fromTemplate creates a label with value', () => {
        const tpl: any = { value: 'lbl', label: 'Label' }
        const lbl = EegLabel.fromTemplate(tpl)
        expect(lbl).toBeInstanceOf(EegLabel)
        // ResourceLabel mock exposes `value` property
        expect((lbl as any).value).toBe('lbl')
    })
})
