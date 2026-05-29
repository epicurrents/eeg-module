/**
 * Helpers for resolving named EEG derivations against the recording setup.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalSetup, SetupChannel } from '@epicurrents/core/dist/types'

/**
 * Normalise an electrode label for case-insensitive matching. Strips whitespace and lowercases —
 * standard 10-20 names are short enough that no further canonicalisation is needed.
 */
const normalise = (label: string) => label.trim().toLowerCase()

/**
 * Look up a setup channel by exact case-insensitive name match and return its raw-signal index.
 * @param channels - Setup channels from `BiosignalSetup.channels`.
 * @param name - Electrode or channel name (`'P3'`, `'p3-p4'`, …).
 * @returns The `SetupChannel.index` (raw EDF signal index), or `-1` if none matches.
 */
const findSourceIndex = (channels: SetupChannel[], name: string): number => {
    const target = normalise(name)
    for (const ch of channels) {
        if (ch && normalise(ch.name) === target) {
            return ch.index
        }
    }
    return -1
}

/**
 * Try to resolve an aEEG derivation against the recording's setup channels. The function
 * attempts up to three strategies depending on whether a `reference` is supplied:
 *
 *  1. **Empty reference** (source-only): find the single named electrode in the setup —
 *     used for recordings where each source channel is already an electrode vs. the
 *     recording's common reference, or where the bipolar pair is stored as one channel.
 *  2. **Direct bipolar match**: a single source channel named like the pair (`'p3-p4'`).
 *  3. **Source / reference split**: two individual electrode channels (`'p3'` and `'p4'`).
 *     The subtraction is performed at trend-compute time; the shared reference cancels out.
 *
 * Returns null if no strategy resolves. The returned indices are raw EDF signal indices
 * (`SetupChannel.index`), suitable for direct use in `BiosignalTrendDerivation`.
 *
 * @param setup - Recording setup whose channels have already been matched against raw signals.
 * @param source - Source electrode name (`'C3'`, `'P3'`, `'c3-p3'`, …).
 * @param reference - Reference electrode name, or `''` for a single-channel derivation.
 */
/**
 * Resolve a list of left/right electrode-name pairs into raw-signal `[leftIdx, rightIdx]`
 * tuples for use as `BiosignalTrendDerivation.pairs`. Pairs whose left or right electrode
 * cannot be matched in the setup are silently skipped. Returns null when none resolve.
 */
export const resolvePdbsiPairs = (
    setup: BiosignalSetup,
    pairs: { left: string, right: string }[],
): [number, number][] | null => {
    const channels = setup.channels
    if (!channels?.length || !pairs.length) {
        return null
    }
    const resolved: [number, number][] = []
    for (const { left, right } of pairs) {
        const l = findSourceIndex(channels, left)
        const r = findSourceIndex(channels, right)
        if (l !== -1 && r !== -1) {
            resolved.push([l, r])
        }
    }
    return resolved.length ? resolved : null
}

export const resolveAeegDerivation = (
    setup: BiosignalSetup,
    source: string,
    reference: string
): { sourceChannels: number[], referenceChannels: number[] } | null => {
    const channels = setup.channels
    if (!channels.length) {
        return null
    }
    // Strategy 1: no reference — the source channel carries the full derivation already.
    if (!reference) {
        const idx = findSourceIndex(channels, source)
        if (idx !== -1) {
            return { sourceChannels: [idx], referenceChannels: [] }
        }
        return null
    }
    // Strategy 2: direct bipolar source channel.
    const bipolar = findSourceIndex(channels, `${source}-${reference}`)
    if (bipolar !== -1) {
        return { sourceChannels: [bipolar], referenceChannels: [] }
    }
    const reverseBipolar = findSourceIndex(channels, `${reference}-${source}`)
    if (reverseBipolar !== -1) {
        // (reference − source) — sign flip is fine for amplitude trends (we rectify).
        return { sourceChannels: [reverseBipolar], referenceChannels: [] }
    }
    // Strategy 3: individual electrodes — subtraction applied at compute time.
    const srcIdx = findSourceIndex(channels, source)
    const refIdx = findSourceIndex(channels, reference)
    if (srcIdx !== -1 && refIdx !== -1) {
        return { sourceChannels: [srcIdx], referenceChannels: [refIdx] }
    }
    return null
}
