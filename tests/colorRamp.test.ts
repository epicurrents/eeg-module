import {
    DEFAULT_DIVERGING_RAMP,
    rampFromHex,
    rampFromSettingsColors,
    sampleRamp,
} from '../src/topography/colorRamp'

describe('colorRamp', () => {
    test('sampleRamp returns the neutral at zero and each pole at full deflection', () => {
        for (const [value, expected] of [
            [0, DEFAULT_DIVERGING_RAMP.neutral],
            [1, DEFAULT_DIVERGING_RAMP.positive],
            [-1, DEFAULT_DIVERGING_RAMP.negative],
        ] as [number, number[]][]) {
            sampleRamp(value).forEach((component, i) => expect(component).toBeCloseTo(expected[i], 6))
        }
    })

    test('sampleRamp clamps beyond the poles instead of extrapolating', () => {
        expect(Array.from(sampleRamp(7))).toEqual(Array.from(sampleRamp(1)))
        expect(Array.from(sampleRamp(-7))).toEqual(Array.from(sampleRamp(-1)))
    })

    test('sampleRamp is monotonic from the neutral towards each pole', () => {
        let previous = 0
        for (let t = 0.1; t <= 1; t += 0.1) {
            // Distance from the neutral must grow with the value, or the ramp reverses somewhere.
            const rgb = sampleRamp(t)
            const distance = Math.hypot(
                rgb[0] - DEFAULT_DIVERGING_RAMP.neutral[0],
                rgb[1] - DEFAULT_DIVERGING_RAMP.neutral[1],
                rgb[2] - DEFAULT_DIVERGING_RAMP.neutral[2],
            )
            expect(distance).toBeGreaterThan(previous)
            previous = distance
        }
    })

    test('the default gamma saturates the mid range more than a linear ramp would', () => {
        // The whole point of a gamma below 1: a half-amplitude value must not render half-saturated,
        // or most of the scalp reads as washed out neutral.
        const half = sampleRamp(0.5)
        const linear = sampleRamp(0.5, { ...DEFAULT_DIVERGING_RAMP, gamma: 1 })
        const towardsPole = (rgb: number[] | Float32Array) =>
            (rgb[0] - DEFAULT_DIVERGING_RAMP.neutral[0])/
            (DEFAULT_DIVERGING_RAMP.positive[0] - DEFAULT_DIVERGING_RAMP.neutral[0])
        expect(towardsPole(half)).toBeGreaterThan(towardsPole(linear))
        expect(DEFAULT_DIVERGING_RAMP.gamma).toBeLessThan(1)
    })

    test('sampleRamp writes into a supplied buffer without allocating', () => {
        const out = new Float32Array(3)
        expect(sampleRamp(1, DEFAULT_DIVERGING_RAMP, out)).toBe(out)
        out.forEach((component, i) => expect(component).toBeCloseTo(DEFAULT_DIVERGING_RAMP.positive[i], 6))
    })

    test('rampFromHex accepts both three and six digit colours', () => {
        const long = rampFromHex('#2b5fd0', '#f0efec', '#cf2f2f')
        expect(long.negative[0]).toBeCloseTo(0x2b/255, 6)
        expect(long.positive[2]).toBeCloseTo(0x2f/255, 6)
        const short = rampFromHex('00f', 'fff', 'f00')
        expect(Array.from(short.negative)).toEqual([0, 0, 1])
        expect(Array.from(short.positive)).toEqual([1, 0, 0])
    })

    test('rampFromHex keeps the default gamma unless one is given', () => {
        expect(rampFromHex('#000', '#888', '#fff').gamma).toBe(DEFAULT_DIVERGING_RAMP.gamma)
        expect(rampFromHex('#000', '#888', '#fff', 0.8).gamma).toBe(0.8)
    })

    test('rampFromSettingsColors drops the alpha component', () => {
        const ramp = rampFromSettingsColors([0, 0, 1, 0.5], [1, 1, 1, 1], [1, 0, 0, 0])
        expect(Array.from(ramp.negative)).toEqual([0, 0, 1])
        expect(Array.from(ramp.positive)).toEqual([1, 0, 0])
    })
})
