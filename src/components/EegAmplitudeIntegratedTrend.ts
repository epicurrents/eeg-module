/**
 * EEG amplitude-integrated (aEEG) trend.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalTrend } from '@epicurrents/core'
import type {
    BiosignalMontageService,
    BiosignalTrend,
    BiosignalTrendDerivation,
    SettingsColor,
} from '@epicurrents/core/dist/types'

/**
 * Amplitude-integrated EEG (aEEG) trend. The clinical convention plots a bipolar derived signal as
 * a vertical line per epoch — line height represents amplitude variability over that epoch. Two
 * homologous trends (one per hemisphere) are typically displayed side-by-side.
 *
 * The math itself is generic (band-pass → rectify → envelope → semi-log compression); this subclass
 * exists to fix the trend `type`, supply NICU-standard defaults (15 s epochs, 2 / 15 Hz band), and
 * carry the per-trend `color` used by the rendering layer.
 */
export default class EegAmplitudeIntegratedTrend extends GenericBiosignalTrend {
    /** Display color for this trend's band — read by the trend strip component. */
    color: SettingsColor

    constructor (
        name: string,
        label: string,
        derivation: Omit<BiosignalTrendDerivation, 'type'>,
        service: BiosignalMontageService,
        options: {
            /** Epoch length in seconds (default 15 s). */
            epochLength?: number
            /** Output sampling rate in Hz (default `2 / epochLength` so each epoch yields a min/max pair). */
            samplingRate?: number
            /** Display color for the band. Defaults to a neutral purple if omitted. */
            color?: SettingsColor
            extraProperties?: Partial<BiosignalTrend>
        } = {}
    ) {
        const epochLength = options.epochLength ?? 15
        const samplingRate = options.samplingRate ?? 2/epochLength
        super(
            name,
            label,
            { ...derivation, type: 'amplitude' },
            samplingRate,
            epochLength,
            service,
            options.extraProperties
        )
        this.color = options.color ?? [0.55, 0.40, 0.85, 0.9]
    }
}
