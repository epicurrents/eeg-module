/**
 * Epicurrents EEG settings.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalAnnotationEvent } from '@epicurrents/core/dist/types'
import { type EegModuleSettings } from '#types'

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
            epochLength: 5,
            envelopeMethod: 'minmax',
            scaleCompression: 'semilog',
        },
        spectrogram: {
            epochLength: 1,    // 1 s epochs → 1 Hz time resolution
            maxFreqHz:   30,   // keep 0–30 Hz (covers delta through gamma for EEG)
            mode: 'proportion',  // proportion is faster to draw and a better default
            averageReference: false,
        },
        ratio: {
            epochLength: 2,
            numeratorBand: [4, 8],     // theta — TAR numerator
            denominatorBand: [8, 13],  // alpha — TAR denominator
            averageReference: true,
        },
        pdbsi: {
            epochLength: 2,
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
