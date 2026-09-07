/**
 * Epicurrents EEG settings.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalAnnotationEvent, TrendEpochScaling } from '@epicurrents/core/dist/types'
import { type EegModuleSettings } from '#types'
/**
 * Epoch lengths by recording length, shared by every trend type.
 *
 * The steps are kinds of recording rather than round numbers: a routine EEG, a longer routine or a
 * child's sleep study, and everything above those. Past the last step there is no kind left to name
 * and the target takes over, holding the epoch count near 2000 however many days the recording
 * runs — at ten-second granularity, so the resulting length stays a number a reader can hold in
 * their head.
 *
 * Two seconds is the floor and no step goes below it. It is a floor on what the epoch can *mean*
 * rather than on how the strip looks: plenty of EEG activity worth seeing on a trend runs longer
 * than a second, and an epoch that short splits such an event across two of them, where each half
 * is classified on its own and neither describes the event. The band trends need the same floor
 * from the other direction, since a one-second epoch resolves the FFT only to 1 Hz and the bands
 * they separate — delta at 1–4 Hz, theta at 4–8 — are a few Hz wide.
 */
const TREND_EPOCH_SCALING: TrendEpochScaling = {
    steps: [
        { epochLength: 2,  fromDuration: 0 },
        { epochLength: 5,  fromDuration: 45*60 },
        { epochLength: 10, fromDuration: 90*60 },
    ],
    targetEpochs: 2000,
    targetQuantum: 10,
}

/**
 * A copy of `scaling` that shares nothing with it, so that configuring one trend type's ladder
 * leaves the other types seeded from the same one alone.
 * @param scaling - Ladder to copy.
 */
const freshScaling = (scaling: TrendEpochScaling): TrendEpochScaling => {
    return { ...scaling, steps: scaling.steps.map(step => ({ ...step })) }
}

const EegSettings: EegModuleSettings = {
    channelTypeMatchers: {
        eeg: [
            'fp1', 'f3', 'c3', 'p3', 'f7', 't3', 't5', 'o1',
            'fp2', 'f4', 'c4', 'p4', 'f8', 't4', 't6', 'o2',
            'fz', 'cz', 'pz',
        ],
        ekg: [
            'ekg', 'ecg',
        ],
        emg: [
            'emg', 'musc',
        ],
        eog: [
            'eog', 'loc', 'roc',
        ],
        res: [
            'res',
        ],
    },
    defaultMontages: {
        'default:10-20': [
            ['rec', 'As recorded'],
            ['avg', 'Average reference'],
            ['lon', 'Double banana'],
            ['trv', 'Transverse'],
        ] as [string, string][],
    },
    defaultSetups: [
        'default:10-20',
    ],
    skipDefaultSetups: false,
    events: {
        convertPatterns: [] as [string, BiosignalAnnotationEvent][],
        ignorePatterns: [] as string[],
    },
    excludeActiveFromAvg: false,
    frequencyBands: [
        { name: 'delta', symbol: 'δ', upperLimit: 4 },
        { name: 'theta', symbol: 'θ', upperLimit: 8 },
        { name: 'alpha', symbol: 'α', upperLimit: 13 },
        { name: 'beta', symbol: 'β', upperLimit: 30 },
    ],
    filterChannelTypes: {
        eeg: ['highpass', 'lowpass', 'notch'],
        ekg: ['notch'],
        eog: ['highpass', 'lowpass', 'notch'],
    },
    filterPaddingSeconds: 10,
    maxNewSignalCacheCycleLength: 300,
    minNewSignalCacheCycleLength: 60,
    precacheMontages: 0,
    showHiddenChannels: false,
    showMissingChannels: false,
    unloadOnClose: false,
    useMemoryManager: false,
    trends: {
        amplitude: {
            bandHighpass: 2,
            bandLowpass: 15,
            epochLength: 0,    // Derived from the recording length; see TREND_EPOCH_SCALING.
            epochScaling: freshScaling(TREND_EPOCH_SCALING),
            envelopeMethod: 'minmax',
            scaleCompression: 'semilog',
        },
        spectrogram: {
            epochLength: 0,    // Derived from the recording length; see TREND_EPOCH_SCALING.
            epochScaling: freshScaling(TREND_EPOCH_SCALING),
            maxFreqHz:   30,   // keep 0–30 Hz (covers delta through gamma for EEG)
            mode: 'proportion',  // proportion is faster to draw and a better default
            averageReference: false,
        },
        ratio: {
            epochLength: 0,    // Derived from the recording length; see TREND_EPOCH_SCALING.
            epochScaling: freshScaling(TREND_EPOCH_SCALING),
            numeratorBand: [4, 8],     // theta — TAR numerator
            denominatorBand: [8, 13],  // alpha — TAR denominator
            averageReference: true,
        },
        pdbsi: {
            epochLength: 0,    // Derived from the recording length; see TREND_EPOCH_SCALING.
            epochScaling: freshScaling(TREND_EPOCH_SCALING),
            band: [1, 4],              // delta — ELECTRA-STROKE
            averageReference: true,
        },
    },
    pdbsi: {
        // Standard homologous 10-20 pairs (front to back). Pairs that don't resolve
        // against a given recording's setup are silently skipped at trend-build time.
        pairs: [
            { left: 'Fp1', right: 'Fp2' },
            { left: 'F3',  right: 'F4'  },
            { left: 'F7',  right: 'F8'  },
            { left: 'C3',  right: 'C4'  },
            { left: 'T3',  right: 'T4'  },
            { left: 'T5',  right: 'T6'  },
            { left: 'P3',  right: 'P4'  },
            { left: 'O1',  right: 'O2'  },
        ],
    },
    aeeg: {
        // Off by default — trend compute runs in the same montage worker as the initial signal
        // requests, and the per-epoch CPU work otherwise delays the first page render until
        // caching is well underway. Setup is triggered on-demand the first time the user toggles
        // the trend strip visible (see `EegViewer.setTrendVisible`). Set this to `true` to start
        // computing the trend automatically as soon as caching completes — useful for kiosk /
        // dashboard deployments where the trend is the primary display.
        autoCompute: false,
        derivations: [
            {
                id: 'left',
                label: 'Left',
                // Cool blue for the left hemisphere; conventional sided color coding.
                color: [0.20, 0.45, 0.85, 0.85],
                candidates: [
                    { source: 'C3', reference: '' },
                    { source: 'P3', reference: '' },
                ],
            },
            {
                id: 'right',
                label: 'Right',
                // Warm orange for the right hemisphere.
                color: [0.90, 0.45, 0.20, 0.85],
                candidates: [
                    { source: 'C4', reference: '' },
                    { source: 'P4', reference: '' },
                ],
            },
        ],
        displayMode: 'separate',
        heightFraction: 0.6,
        visible: true,
    },
}
export default EegSettings
