/**
 * Epicurrents EEG module config types.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import {
    type BaseModuleSettings,
    type CommonBiosignalSettings,
    type SettingsColor,
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
    /**
     * When true, skip loading the default setups and montages (e.g. the 10-20 system)
     * on recording activation. Use this when the project provides its own complete
     * set of setups via `extraSetups` / `extraMontages` and the defaults would add
     * unwanted clutter to the montage list.
     */
    skipDefaultSetups?: boolean
    /**
     * Frequency-ratio trend setup. Carries only the derivation list; the math knobs (epoch length,
     * numerator / denominator bands, referencing) live in {@link trends.ratio}. Omit `derivations`
     * to reuse {@link aeeg}'s, which is the common case — the two trends conventionally describe
     * the same hemispheres.
     */
    ratio?: {
        derivations?: TrendDerivation[]
    }
    /**
     * Power spectrogram trend setup. Same split as {@link ratio}: derivations here, math knobs in
     * {@link trends.spectrogram}, and an omitted `derivations` reuses {@link aeeg}'s.
     */
    spectrogram?: {
        derivations?: TrendDerivation[]
    }
    /**
     * pdBSI (pairwise derived Brain Symmetry Index) setup. Carries the homologous L/R
     * electrode pair list — EEG-specific because the pair names follow 10-20 electrode
     * conventions. Math knobs live in {@link trends.pdbsi} (inherited from
     * {@link CommonBiosignalSettings}); display-only knobs live in the interface
     * module's `EegInterfaceSettings.trends.pdbsi`.
     */
    pdbsi?: {
        /**
         * Homologous electrode pairs over which the index is averaged each epoch.
         * Pairs whose left or right electrode cannot be matched in the recording setup
         * are silently skipped; the trend is registered only if at least one pair resolves.
         */
        pairs: { left: string, right: string }[]
    }
    /** aEEG (amplitude-integrated EEG) trend settings. Resolves against the active montage. */
    aeeg?: {
        /**
         * Whether to automatically compute the aEEG trend(s) as soon as the recording's signal
         * caching completes. When `false` (default), the trend is set up lazily the first time
         * the user toggles the trend strip visible — this keeps the montage worker free for
         * initial signal-page rendering on every recording open, at the cost of a one-time
         * compute delay when the strip is first opened.
         *
         * Each entry in {@link derivations} resolves its candidates against the active montage
         * in order, creating one trend with the first candidate that resolves.
         */
        autoCompute: boolean
        /**
         * One entry per trend slot. The standard NICU aEEG layout is two homologous trends —
         * one for each hemisphere — so the user can compare left vs. right side activity.
         * Doubles as the fallback for {@link ratio} and {@link spectrogram} when those declare no
         * derivations of their own.
         */
        derivations: TrendDerivation[]
        /**
         * Layout for multiple aEEG bands in the trend strip.
         *  - `'separate'`: each band gets its own vertical slot (left on top, right below).
         *  - `'superimposed'`: all bands are drawn on the same vertical slot with reduced alpha,
         *    making left-vs-right comparison easier at the cost of some band overlap.
         *
         * EegViewer forces `'superimposed'` automatically when the trend strip is compressed
         * below the dual-slot height threshold (see EegViewer's `effectiveTrendDisplayMode`).
         */
        displayMode: 'separate' | 'superimposed'
        /** Fraction of the navigator strip's height to use for the aEEG band (0.0–1.0). */
        heightFraction: number
        /** Whether the band is currently shown. Setting false hides the band without disposing the trend. */
        visible: boolean
    }
}

/**
 * One slot in a per-hemisphere (or otherwise grouped) trend: a labelled derivation plus the
 * candidates used to resolve it against a recording's setup. Shared by the aEEG, frequency-ratio
 * and spectrogram trends, each of which creates one trend per entry.
 */
export type TrendDerivation = {
    /** Stable identifier used as the trend name suffix (e.g. `'left'` → `'aeeg-left'`). */
    id: string
    /** Display label shown in the trend strip's left-side legend. */
    label: string
    /** Color of this trend's filled band. */
    color: SettingsColor
    /**
     * Candidate derivations in priority order. The resolver tries each in turn and stops at the
     * first one whose electrodes can be found in the active montage. Each entry is
     * `{ source, reference }` — see {@link resolveAeegDerivation} for the matching rules (an empty
     * reference matches the source channel alone, then a direct bipolar channel name, then the two
     * electrode names individually).
     */
    candidates: { source: string, reference: string }[]
}
