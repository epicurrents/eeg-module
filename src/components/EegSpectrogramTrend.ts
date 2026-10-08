/**
 * EEG spectrogram trend.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalTrendService } from '@epicurrents/core/types'
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
            /** Seconds between epoch starts; empty or zero means the epoch length. */
            epochStep?: number
            samplingRate?: number
            /**
             * Number of output frequency bins per epoch. One per Hz up to `maxFreqHz` keeps the
             * signal layout independent of the epoch length.
             */
            frequencyBins: number
            maxFreqHz?: number
        }
    ) {
        super(name, label, 'spectrogram', service, {
            epochLength: options.epochLength ?? 1,
            epochStep: options.epochStep,
            samplingRate: options.samplingRate,
        })
        this._frequencyBins = options.frequencyBins
        this._maxFreqHz = options.maxFreqHz
    }
}
