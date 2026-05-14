/**
 * Helpers for resolving named EEG derivations against the active montage.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalMontage, MontageChannel } from '@epicurrents/core/dist/types'

/**
 * Normalise an electrode label for case-insensitive matching. Strips whitespace and lowercases —
 * standard 10-20 names are short enough that no further canonicalisation is needed.
 */
const normalise = (label: string) => label.trim().toLowerCase()

/**
 * Look up a montage channel by exact case-insensitive name match.
 * @param channels - Montage channels (in their natural index order).
 * @param name - Electrode or channel name (`'P3'`, `'p3-p4'`, …).
 * @returns Index of the matching channel, or `-1` if none matches.
 */
const findChannelIndex = (channels: MontageChannel[], name: string) => {
    const target = normalise(name)
    for (let i = 0; i < channels.length; i++) {
        if (channels[i] && normalise(channels[i].name) === target) {
            return i
        }
    }
    return -1
}

/**
 * Try to resolve an aEEG derivation against a montage's channels. The function attempts up to
 * three strategies depending on whether a `reference` is supplied:
 *
 *  1. **Empty reference** (source-only): just find the single named channel — used when the
 *     active montage already contains the desired derivation in one channel (e.g. an electrode
 *     against a common reference in the `'rec'` "as recorded" montage, or a pre-bipolar channel
 *     like `'c3-p3'`).
 *  2. **Direct bipolar match**: a single channel named like the pair (`'p3-p4'`). Used when the
 *     active montage already contains the cross-cerebral derivation as one bipolar channel.
 *  3. **Source / reference split**: two individual electrode channels (`'p3'` and `'p4'`). The
 *     subtraction is performed at trend-compute time; useful for referential montages where the
 *     shared reference cancels out.
 *
 * Returns null if no strategy resolves the requested channel(s).
 *
 * @param montage - Active montage to resolve against.
 * @param source - Source channel name (`'C3'`, `'P3'`, `'c3-p3'`, …).
 * @param reference - Optional reference electrode name. Pass `''` to request a single-channel
 *                    derivation (no subtraction).
 */
export const resolveAeegDerivation = (
    montage: BiosignalMontage,
    source: string,
    reference: string
): { sourceChannels: number[], referenceChannels: number[] } | null => {
    const channels = montage.channels
    if (!channels.length) {
        return null
    }
    // Strategy 1: no reference — caller wants the source channel as-is. Useful for referential
    // montages where each channel is already an electrode vs. the recording's common reference.
    if (!reference) {
        const idx = findChannelIndex(channels, source)
        if (idx !== -1) {
            return { sourceChannels: [idx], referenceChannels: [] }
        }
        return null
    }
    // Strategy 2: direct bipolar channel.
    const bipolar = findChannelIndex(channels, `${source}-${reference}`)
    if (bipolar !== -1) {
        return { sourceChannels: [bipolar], referenceChannels: [] }
    }
    const reverseBipolar = findChannelIndex(channels, `${reference}-${source}`)
    if (reverseBipolar !== -1) {
        // (reference − source) — sign flip is fine for amplitude trends (we rectify next).
        return { sourceChannels: [reverseBipolar], referenceChannels: [] }
    }
    // Strategy 3: individual electrodes (works for referential montages).
    const srcIdx = findChannelIndex(channels, source)
    const refIdx = findChannelIndex(channels, reference)
    if (srcIdx !== -1 && refIdx !== -1) {
        return { sourceChannels: [srcIdx], referenceChannels: [refIdx] }
    }
    return null
}
