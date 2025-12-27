/**
 * Epicurrents EEG settings.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { BiosignalAnnotationEvent, AnnotationLabel } from '@epicurrents/core/dist/types'
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
    labels: {
        convertPatterns: [] as [string, AnnotationLabel][],
        ignorePatterns: [] as string[],
    },
    maxNewSignalCacheCycleLength: 300,
    minNewSignalCacheCycleLength: 60,
    precacheMontages: 0,
    showHiddenChannels: false,
    showMissingChannels: false,
    unloadOnClose: false,
    useMemoryManager: false,
}
export default EegSettings
