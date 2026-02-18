import EegService from '../src/service/EegService'

describe('EegService', () => {
    test('constructor wires worker addEventListener', () => {
        const calls: any[] = []
        const fakeWorker: any = { addEventListener: (ev: string, cb: any) => calls.push({ ev }) }
        const svc = new EegService({}, fakeWorker, undefined)
        expect(svc).toBeInstanceOf(EegService)
        expect(calls.length).toBeGreaterThanOrEqual(0)
    })

    test('handleMessage returns false on missing data', async () => {
        const svc = new EegService({}, { addEventListener: () => {} } as unknown as Worker, undefined)
        const result = await (svc as any).handleMessage({})
        expect(result).toBe(false)
    })
})
