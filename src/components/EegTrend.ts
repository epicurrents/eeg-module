/**
 * Base class for EEG-specific biosignal trends.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalTrend } from '@epicurrents/core'
import type {
    BiosignalSetup,
    BiosignalTrendService,
    BiosignalTrendType,
} from '@epicurrents/core/dist/types'
import { resolveAeegDerivation } from '../util/derivation'

/**
 * Base class for EEG trends. Extends `GenericBiosignalTrend` with:
 *  - A `color` property used by the rendering layer to identify the trend visually.
 *  - `tryResolveDerivation` — resolves source/reference channel indices from the
 *    recording's `BiosignalSetup` and populates `_derivation`. Call this before
 *    passing the trend to `EegRecording._setupTrend`; if it returns `false` the
 *    recording does not have the required channels and the trend should be discarded.
 *
 * Subclasses fix the `BiosignalTrendType` and supply type-specific defaults
 * (epoch length, band-pass frequencies, etc.).
 */
export default class EegTrend extends GenericBiosignalTrend {
    constructor (
        name: string,
        label: string,
        type: BiosignalTrendType,
        service: BiosignalTrendService,
        options: {
            epochLength?: number
            samplingRate?: number
        } = {}
    ) {
        const epochLength = options.epochLength ?? 5
        const samplingRate = options.samplingRate ?? 1 / epochLength
        super(name, label, { sourceChannels: [], referenceChannels: [], type }, service, { samplingRate, epochLength })
    }

    /**
     * Attempt to resolve a derivation against the recording's setup channels. On success
     * `_derivation` is populated with raw EDF signal indices and the method returns `true`.
     * Returns `false` when none of the candidates can be matched — the caller should not
     * register this trend on the recording.
     *
     * @param setup - Recording setup (channels already matched against raw EDF signals).
     * @param candidates - Ordered list of electrode-name pairs to try, highest-preference first.
     */
    tryResolveDerivation (
        setup: BiosignalSetup,
        candidates: { source: string, reference: string }[],
        options: { averageReference?: boolean } = {}
    ): boolean {
        if (!setup?.channels?.length) {
            return false
        }
        for (const candidate of candidates) {
            const resolved = resolveAeegDerivation(setup, candidate.source, candidate.reference)
            if (resolved) {
                this._derivation = {
                    ...this._derivation,
                    sourceChannels: resolved.sourceChannels,
                    referenceChannels: resolved.referenceChannels,
                    averageReference: options.averageReference ?? false,
                }
                // Derivation is now complete — register the trend with its service.
                this._registerWithService()
                return true
            }
        }
        return false
    }
}
