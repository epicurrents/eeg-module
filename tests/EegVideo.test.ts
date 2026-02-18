import EegVideo from '../src/components/EegVideo'

describe('EegVideo', () => {
    test('getters and setters work', () => {
        const v = new EegVideo('http://x', 0, 10, 1, [{0:0}])
        expect(v.url).toBe('http://x')
        expect(v.startTime).toBe(0)
        expect(v.endTime).toBe(10)
        v.endTime = 20
        expect(v.endTime).toBe(20)
        v.syncPoints = [{1:2}]
        expect(v.syncPoints[0][1]).toBe(2)
    })
})
