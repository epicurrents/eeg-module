import EegEvent from '../src/components/EegEvent'

describe('EegEvent', () => {
    test('CODED_EVENTS contains background alpha', () => {
        const ev = EegEvent.getEventForCode('EEG_BKG_ALPHA')
        expect(ev).not.toBeNull()
        expect(ev?.name).toContain('alpha')
    })

    test('getEventForCode recognizes dicom code', () => {
        const ev = EegEvent.getEventForCode('MDC/2:23592', 'dicom')
        expect(ev).not.toBeNull()
        expect(ev?.code).toBe('EEG_BKG_ALPHA')
    })

    test('getEventForLabel finds by name', () => {
        const ev = EegEvent.getEventForLabel('Background alpha activity')
        expect(ev).not.toBeNull()
        expect(ev?.code).toBe('EEG_BKG_ALPHA')
    })

    test('fromTemplate creates an EegEvent instance', () => {
        const tpl: any = { start: 1, duration: 2, label: 'test' }
        const e = EegEvent.fromTemplate(tpl)
        expect(e).toBeInstanceOf(EegEvent)
        expect(e.start).toBe(1)
    })
})
