/**
 * Epicurrents EEG module config types.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import {
    type BaseModuleSettings,
    type CommonBiosignalSettings,
} from '@epicurrents/core/dist/types'

export type EegModuleSettings = BaseModuleSettings & CommonBiosignalSettings & {
    /** List of channel types and their (known) corresponding signal labels. */
    channelTypeMatchers: {
        /** All possible signal labels that should be classified as EEG. */
        eeg: string[]
        /** All possible signal labels that should be classified as EKG. */
        ekg: string[]
        /** All possible signal labels that should be classified as EMG. */
        emg: string[]
        /** All possible signal labels that should be classified as EOG. */
        eog: string[]
        /** All possible signal labels that should be classified as respiration. */
        res: string[]
    }
    /** Should the active channels be excluded from the average calculation? */
    excludeActiveFromAvg: boolean
    /** Definition of EEG frequency bands. */
    frequencyBands: { name: string, symbol: string, upperLimit: number }[]
    /**
     * Maximum length of new signals in the cache to load in one go when running
     * a new montage signal cache cycle (measured in seconds of signal data).
     * Setting this value too high may cause cache cycles to run quite slow.
     */
    maxNewSignalCacheCycleLength: number
    /**
     * Minimum length of new signals in the cache in order to trigger a montage
     * signal cache cycle (measured in seconds of signal data). Setting this value
     * lower will increase overhead from padding and setting it higher will
     * cause cycles to run at greater intervals when loading new signal data.
     */
    minNewSignalCacheCycleLength: number
}
