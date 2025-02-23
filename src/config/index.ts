/**
 * Epicurrents EEG settings.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { type BiosignalAnnotation } from '@epicurrents/core/dist/types'
import { type EegModuleSettings } from '#types'

const EegSettings: EegModuleSettings = {
    annotations: {
        convertPatterns: [] as [string, BiosignalAnnotation][],
        ignorePatterns: [] as string[],
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
    filters: {
        highpass: {
            availableValues: [0, 0.1, 0.3, 0.5, 0.7, 1, 1.5, 2, 2.5, 3, 4, 5],
            default: 0.3,
        },
        lowpass: {
            availableValues: [0, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 100],
            default: 70,
        },
        notch: {
            availableValues: [0, 50, 60],
            default: 0,
        },
    },
    labelMatchers: {
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
    maxNewSignalCacheCycleLength: 300,
    minNewSignalCacheCycleLength: 60,
    montages: {
        cacheMax: 2,
        preCache: false,
    },
    showHiddenChannels: false,
    showMissingChannels: false,
}
export default EegSettings
