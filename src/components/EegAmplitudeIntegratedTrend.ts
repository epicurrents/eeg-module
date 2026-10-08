/**
 * EEG amplitude-integrated (aEEG) trend.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalTrendService } from '@epicurrents/core/types'
import EegTrend from './EegTrend'

/**
 * Amplitude-integrated EEG (aEEG) trend. Fixes the trend type to `'amplitude'` and
 * supplies NICU-standard defaults (5 s epochs, 2 / 15 Hz band-pass).
 *
 * Display properties such as band colour live in settings rather than on the trend object, which
 * keeps this class purely computational.
 */
export default class EegAmplitudeIntegratedTrend extends EegTrend {
    constructor (
        name: string,
        label: string,
        service: BiosignalTrendService,
        options: { epochLength?: number, epochStep?: number } = {}
    ) {
        super(name, label, 'amplitude', service, {
            epochLength: options.epochLength ?? 5,
            epochStep: options.epochStep,
        })
    }
}
