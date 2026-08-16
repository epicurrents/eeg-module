/**
 * Shared diverging colour ramp for scalp field displays.
 *
 * Both the 2D topogram and the 3D surface field map must colour the same voltage the same way, so the ramp lives here
 * rather than being duplicated in each. Keeping it in one place also gives the interface a single object to bind user
 * settings to.
 *
 * The ramp is diverging, not sequential: EEG potentials have a meaningful zero and a sign, so the midpoint is a neutral
 * and each pole gets its own hue. A third hue at the midpoint reads as a third category and destroys that.
 *
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { DivergingRamp, Rgb } from '#types/topography'

/**
 * Default ramp: blue to neutral to red.
 *
 * The poles stay separable under protanopia and deuteranopia (OKLab dE 25 between them), so the sign of the field is
 * never carried by a red/green distinction. `gamma` is well below 1 because a field is dominated by values far under
 * its peak, and a linear ramp renders most of the scalp near-neutral.
 */
export const DEFAULT_DIVERGING_RAMP: DivergingRamp = {
    negative: [0.169, 0.373, 0.816],   // #2b5fd0
    neutral:  [0.941, 0.937, 0.925],   // #f0efec
    positive: [0.812, 0.184, 0.184],   // #cf2f2f
    gamma: 0.55,
}

/**
 * Sample a diverging ramp.
 * @param t - Normalised value in -1..1; values outside are clamped.
 * @param ramp - Ramp to sample.
 * @param out - Optional 3-element destination, to avoid allocating per sample.
 * @returns RGB with components in 0..1.
 */
export const sampleRamp = (
    t: number,
    ramp: DivergingRamp = DEFAULT_DIVERGING_RAMP,
    out: number[] | Float32Array = new Array(3),
) => {
    const clamped = t < -1 ? -1 : t > 1 ? 1 : t
    const a = Math.pow(Math.abs(clamped), ramp.gamma)
    const pole = clamped < 0 ? ramp.negative : ramp.positive
    const mid = ramp.neutral
    out[0] = mid[0] + a*(pole[0] - mid[0])
    out[1] = mid[1] + a*(pole[1] - mid[1])
    out[2] = mid[2] + a*(pole[2] - mid[2])
    return out
}

const hexToRgb = (hex: string): Rgb => {
    const h = hex.replace('#', '')
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
    return [((n >> 16) & 255)/255, ((n >> 8) & 255)/255, (n & 255)/255]
}

/**
 * Build a ramp from hex colours.
 * @param negative - Hex colour for the negative pole.
 * @param neutral - Hex colour for zero.
 * @param positive - Hex colour for the positive pole.
 * @param gamma - Saturation curve exponent; defaults to the shared default.
 */
export const rampFromHex = (
    negative: string,
    neutral: string,
    positive: string,
    gamma = DEFAULT_DIVERGING_RAMP.gamma,
): DivergingRamp => ({
    negative: hexToRgb(negative),
    neutral: hexToRgb(neutral),
    positive: hexToRgb(positive),
    gamma,
})

/**
 * Build a ramp from settings colours, i.e. RGBA components in the range 0..1.
 *
 * The alpha component of each setting colour is ignored: the ramp is opaque by construction, and a translucent field
 * would take its apparent hue from whatever happens to be behind it.
 * @param negative - Settings colour for the negative pole.
 * @param neutral - Settings colour for zero.
 * @param positive - Settings colour for the positive pole.
 * @param gamma - Saturation curve exponent; defaults to the shared default.
 */
export const rampFromSettingsColors = (
    negative: number[],
    neutral: number[],
    positive: number[],
    gamma = DEFAULT_DIVERGING_RAMP.gamma,
): DivergingRamp => ({
    negative: [negative[0], negative[1], negative[2]],
    neutral: [neutral[0], neutral[1], neutral[2]],
    positive: [positive[0], positive[1], positive[2]],
    gamma,
})
