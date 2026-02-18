import EegSetup from '../src/components/EegSetup'

describe('EegSetup', () => {
    test('constructor stores name from config', () => {
        const channels: any[] = []
        const cfg: any = { name: 'mysetup' }
        const s = new EegSetup(channels, cfg)
        expect(s).toBeInstanceOf(EegSetup)
        expect((s as any).name).toBe('mysetup')
    })
})
