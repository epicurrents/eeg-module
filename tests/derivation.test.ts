/**
 * Unit tests for the derivation resolvers: every trend reaches its electrodes through these, and a
 * failure to resolve costs the trend silently — the builders log a debug line and move on.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import type { BiosignalSetup } from '@epicurrents/core/types'
import { resolveAeegDerivation, resolvePdbsiPairs } from '../src/util/derivation'

/**
 * A setup carrying the given channel names. The raw-signal index is deliberately not the position in
 * the list: the resolvers must return `SetupChannel.index`, and returning the array position instead
 * would read the wrong signal while every same-order fixture still passed.
 */
const setupOf = (...names: string[]) => ({
    channels: names.map((name, i) => ({ name, index: 10 + i })),
} as unknown as BiosignalSetup)

describe('resolveAeegDerivation', () => {
    test('strategy 1: an empty reference resolves the source channel alone', () => {
        const resolved = resolveAeegDerivation(setupOf('C3', 'C4'), 'C4', '')
        expect(resolved).toEqual({ sourceChannels: [11], referenceChannels: [] })
    })

    test('strategy 2: a channel named like the pair resolves as one bipolar source', () => {
        const resolved = resolveAeegDerivation(setupOf('Fp1', 'C3-P3', 'C4'), 'C3', 'P3')
        expect(resolved).toEqual({ sourceChannels: [11], referenceChannels: [] })
    })

    test('strategy 2 accepts the pair named the other way round', () => {
        // The trend rectifies, so (reference − source) carries the same amplitude.
        const resolved = resolveAeegDerivation(setupOf('P3-C3'), 'C3', 'P3')
        expect(resolved).toEqual({ sourceChannels: [10], referenceChannels: [] })
    })

    test('strategy 2 is preferred over strategy 3 when both could resolve', () => {
        // With the bipolar channel present, subtracting the two individual electrodes would compute a
        // derivation the recording already carries, at a different amplitude.
        const resolved = resolveAeegDerivation(setupOf('C3', 'P3', 'C3-P3'), 'C3', 'P3')
        expect(resolved).toEqual({ sourceChannels: [12], referenceChannels: [] })
    })

    test('strategy 3: two individual electrodes resolve as source and reference', () => {
        const resolved = resolveAeegDerivation(setupOf('C3', 'P3'), 'C3', 'P3')
        expect(resolved).toEqual({ sourceChannels: [10], referenceChannels: [11] })
    })

    test('matching ignores case and surrounding whitespace', () => {
        expect(resolveAeegDerivation(setupOf(' c3 '), 'C3', '')).toEqual({
            sourceChannels: [10], referenceChannels: [],
        })
        expect(resolveAeegDerivation(setupOf('c3-p3'), 'C3', 'P3')).toEqual({
            sourceChannels: [10], referenceChannels: [],
        })
    })

    test('a reference that resolves alone is not enough', () => {
        // Half a derivation is not a derivation: returning the source with no reference would report
        // an absolute potential as though it were the requested difference.
        expect(resolveAeegDerivation(setupOf('C3'), 'C3', 'P3')).toBeNull()
        expect(resolveAeegDerivation(setupOf('P3'), 'C3', 'P3')).toBeNull()
    })

    test('an unmatched source resolves to null', () => {
        expect(resolveAeegDerivation(setupOf('C3', 'C4'), 'T5', '')).toBeNull()
    })

    test('a setup with no channels resolves to null', () => {
        expect(resolveAeegDerivation(setupOf(), 'C3', '')).toBeNull()
    })

    test('a name is matched whole rather than as a prefix', () => {
        // `C3` must not be served by `C3A2` or `C30`; each names a different electrode or derivation.
        expect(resolveAeegDerivation(setupOf('C3A2', 'C30'), 'C3', '')).toBeNull()
    })
})

describe('resolvePdbsiPairs', () => {
    test('resolves every pair both of whose electrodes are present', () => {
        const setup = setupOf('Fp1', 'Fp2', 'C3', 'C4')
        expect(resolvePdbsiPairs(setup, [
            { left: 'Fp1', right: 'Fp2' },
            { left: 'C3', right: 'C4' },
        ])).toEqual([[10, 11], [12, 13]])
    })

    test('skips a pair that is missing one side and keeps the rest', () => {
        // The index is a homologous comparison, so a pair with one side missing has to be dropped
        // whole; pairing it against whatever resolved next would compare unrelated electrodes.
        const setup = setupOf('Fp1', 'Fp2', 'C3')
        expect(resolvePdbsiPairs(setup, [
            { left: 'Fp1', right: 'Fp2' },
            { left: 'C3', right: 'C4' },
            { left: 'T3', right: 'T4' },
        ])).toEqual([[10, 11]])
    })

    test('returns null when no pair resolves, rather than an empty list', () => {
        // `EegPdBsiTrend.tryResolvePairs` reads the null as "discard this trend"; an empty array is
        // truthy and would register a trend with no inputs.
        expect(resolvePdbsiPairs(setupOf('C3', 'C4'), [{ left: 'T5', right: 'T6' }])).toBeNull()
    })

    test('returns null for an empty pair list and for an empty setup', () => {
        expect(resolvePdbsiPairs(setupOf('C3', 'C4'), [])).toBeNull()
        expect(resolvePdbsiPairs(setupOf(), [{ left: 'C3', right: 'C4' }])).toBeNull()
    })

    test('matching ignores case', () => {
        expect(resolvePdbsiPairs(setupOf('c3', 'c4'), [{ left: 'C3', right: 'C4' }])).toEqual([[10, 11]])
    })
})
