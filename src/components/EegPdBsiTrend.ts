/**
 * EEG pairwise derived Brain Symmetry Index (pdBSI) trend.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalSetup, BiosignalTrendService } from '@epicurrents/core/dist/types'
import EegTrend from './EegTrend'
import { resolvePdbsiPairs } from '../util/derivation'

/**
 * pdBSI trend: a single per-epoch value computed across a set of homologous left/right
 * electrode pairs.
 *
 *   pdBSI = mean over pairs of |P_R − P_L| / (P_R + P_L)
 *
 * where `P_L` and `P_R` are total FFT power inside `band` for the left and right
 * electrode respectively. Output lives on `[0, 1]`. Optional Common Average Reference
 * is applied uniformly to every input channel before the FFT so a single noisy
 * reference electrode cannot bias one hemisphere over the other.
 *
 * Pairs are resolved via {@link tryResolvePairs} against the recording's setup; the
 * trend should be discarded (not registered) when no pair resolves.
 */
export default class EegPdBsiTrend extends EegTrend {
    constructor (
        name: string,
        label: string,
        service: BiosignalTrendService,
        options: {
            epochLength?: number
            samplingRate?: number
            band: [number, number]
        },
    ) {
        const epochLength = options.epochLength ?? 2
        const samplingRate = options.samplingRate ?? 1 / epochLength
        super(name, label, 'pdbsi', service, { epochLength, samplingRate })
        this._band = options.band
    }

    /**
     * Attempt to resolve a list of L/R electrode-name pairs against the recording's setup.
     * On success, the trend's derivation is populated with raw-signal index pairs and the
     * trend is registered with its service; returns `true`. Returns `false` when none of
     * the pairs match — the caller should discard the trend in that case.
     *
     * @param setup - Recording setup (channels already matched against raw EDF signals).
     * @param pairs - List of `{ left, right }` electrode-name pairs to resolve.
     */
    tryResolvePairs (
        setup: BiosignalSetup,
        pairs: { left: string, right: string }[],
        options: { averageReference?: boolean } = {},
    ): boolean {
        const resolved = resolvePdbsiPairs(setup, pairs)
        if (!resolved) {
            return false
        }
        this._derivation = {
            ...this._derivation,
            pairs: resolved,
            averageReference: options.averageReference ?? true,
        }
        this._registerWithService()
        return true
    }
}
