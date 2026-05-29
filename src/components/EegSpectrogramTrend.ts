/**
 * EEG spectrogram trend.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalTrendService } from '@epicurrents/core/dist/types'
import EegTrend from './EegTrend'

/**
 * Per-hemisphere power spectrogram trend. Signal layout:
 * `signal[epochIndex * frequencyBins + binIndex]` = power at `binIndex` Hz bin for that epoch.
 */
export default class EegSpectrogramTrend extends EegTrend {
    constructor (
        name: string,
        label: string,
        service: BiosignalTrendService,
        options: {
            epochLength?: number
            samplingRate?: number
            /** Number of frequency bins per epoch — computed from recordingSamplingRate × epochLength. */
            frequencyBins: number
            maxFreqHz?: number
        }
    ) {
        const epochLength = options.epochLength ?? 1
        const samplingRate = options.samplingRate ?? 1 / epochLength
        super(name, label, 'spectrogram', service, { epochLength, samplingRate })
        this._frequencyBins = options.frequencyBins
        this._maxFreqHz = options.maxFreqHz
    }
}
