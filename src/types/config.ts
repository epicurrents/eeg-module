/**
 * EpiCurrents config types.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import {
    type BaseModuleSettings,
    type CommonBiosignalSettings,
    type PlotLineStyles,
    type SettingsColor
} from "@epicurrents/core/dist/types"

export type EegModuleSettings = BaseModuleSettings & CommonBiosignalSettings & {
    continuousBrowseDelay: number
    continuousBrowseInterval: number
    cursor: {
        color: SettingsColor
        width: number
    }
    excludeActiveFromAvg: boolean
    fft: {
        frequencyBands: { name: string, symbol: string, upperLimit: number }[]
    }
    highlights: {
        /** Display a fading collar before and after a highlight. */
        showCollars: boolean
    }
    isoelLine: PlotLineStyles
    labelMatchers: {
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
    navigator: {
        annotationColor: SettingsColor
        borderColor: SettingsColor
        cachedColor: SettingsColor
        gapColor: SettingsColor
        loadedColor: SettingsColor
        loadingColor: SettingsColor
        theme: string
        tickColor: SettingsColor
        viewBoxColor: SettingsColor
    }
    trace: {
        color: {
            eeg: SettingsColor
                sin: SettingsColor
                dex: SettingsColor
                mid: SettingsColor
            ekg: SettingsColor
            emg: SettingsColor
            eog: SettingsColor
            res: SettingsColor
            meta: SettingsColor
            default: SettingsColor
        }
        colorSides: boolean
        selections: {
            color: SettingsColor
        }
        theme: string
        width: {
            eeg: number
            ekg: number
            eog: number
        }
    }
}