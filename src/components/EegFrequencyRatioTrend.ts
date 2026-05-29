/**
 * EEG frequency-ratio trend (TAR / DAR / DTABR / …).
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalTrendService } from '@epicurrents/core/dist/types'
import EegTrend from './EegTrend'

/**
 * Per-derivation frequency-band ratio (e.g. TAR = theta / alpha, DAR = delta / alpha).
 *
 * Each epoch's output is a single value on the normalised scale
 *   `(P_num − P_den) / (P_num + P_den)` ∈ [−1, +1]
 * where `P_num` and `P_den` are total FFT power inside `numeratorBand` and
 * `denominatorBand` respectively. The normalised form is independent of the
 * absolute amplitude scale so a single threshold setting covers both extremes
 * regardless of which band convention the deployment configures.
 *
 * Channel derivation follows the same `tryResolveDerivation` pattern as aEEG —
 * one trend per hemisphere / region using the same `aeeg.derivations` candidate
 * lists supplied by the deployment.
 */
export default class EegFrequencyRatioTrend extends EegTrend {
    constructor (
        name: string,
        label: string,
        service: BiosignalTrendService,
        options: {
            epochLength?: number
            samplingRate?: number
            numeratorBand: [number, number]
            denominatorBand: [number, number]
        },
    ) {
        const epochLength = options.epochLength ?? 2
        const samplingRate = options.samplingRate ?? 1 / epochLength
        super(name, label, 'ratio', service, { epochLength, samplingRate })
        this._numeratorBand = options.numeratorBand
        this._denominatorBand = options.denominatorBand
    }
}
