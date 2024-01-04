/**
 * EpiCurrents EEG settings.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { type BiosignalAnnotation, type SettingsColor } from '@epicurrents/core/dist/types'

const EegSettings = {
    _settingsMenu: {
        description: 'Electroencephalography settings.',
        fields: [
            {
                text: 'Display options',
                type: 'subtitle',
            },
            {
                text: 'Alter the default appearance of EEG traces.',
                type: 'description',
            },
            {
                component: 'settings-checkbox',
                setting: 'eeg.antialiasing',
                text: 'Apply antialiasing to EEG traces',
                type: 'setting',
            },
            {
                text: 'Color options',
                type: 'subtitle',
            },
            {
                text: 'Set the color of different trace types.',
                type: 'description',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.trace.color.eeg',
                text: 'Default color of the EEG traces',
                type: 'setting',
            },
            {
                component: 'settings-checkbox',
                setting: 'eeg.trace.colorSides',
                text: 'Use different colors for left and right side traces',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.trace.color.sin',
                text: 'Color of the left side EEG traces',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.trace.color.dex',
                text: 'Color of the right side EEG traces',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.trace.color.mid',
                text: 'Color of the midline EEG traces',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.trace.color.ekg',
                text: 'Default color of the EKG traces',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.trace.color.eog',
                text: 'Default color of the EOG traces',
                type: 'setting',
            },
            {
                text: 'Color presets',
                type: 'subtitle',
            },
            {
                text: 'You may also use one of the following EEG trace color presets.',
                type: 'description',
            },
            {
                component: 'settings-preset',
                presets: [
                    { setting: 'eeg.trace.colorSides', value: false },
                    { setting: 'eeg.trace.color.eeg', value: 'rgba(0,0,0,255)' },
                    { setting: 'eeg.trace.color.ekg', value: 'rgba(0,0,0,255)' },
                    { setting: 'eeg.trace.color.emg', value: 'rgba(0,0,0,255)' },
                    { setting: 'eeg.trace.color.eog', value: 'rgba(0,0,0,255)' },
                    { setting: 'eeg.trace.color.res', value: 'rgba(0,0,0,255)' },
                ],
                text: 'All traces black.',
                type: 'preset',
            },
            {
                component: 'settings-preset',
                presets: [
                    { setting: 'eeg.trace.colorSides', value: false },
                    { setting: 'eeg.trace.color.eeg', value: 'rgba(0,0,0,255)' },
                    { setting: 'eeg.trace.color.ekg', value: '#rgba(200,0,0,255)' },
                    { setting: 'eeg.trace.color.emg', value: 'rgba(80,0,0,255)' },
                    { setting: 'eeg.trace.color.eog', value: 'rgba(0,0,200,255)' },
                    { setting: 'eeg.trace.color.res', value: 'rgba(0,200,0,255)' },
                ],
                text: 'EEG traces black, polygraphic traces colored.',
                type: 'preset',
            },
            {
                component: 'settings-preset',
                presets: [
                    { setting: 'eeg.trace.colorSides', value: true },
                    { setting: 'eeg.trace.color.dex', value: 'rgba(0,0,120,255)' },
                    { setting: 'eeg.trace.color.mid', value: 'rgba(0,120,0,255)' },
                    { setting: 'eeg.trace.color.sin', value: 'rgba(120,0,0,255)' },
                ],
                text: 'Left side red, right side blue, midline green.',
                type: 'preset',
            },
            {
                component: 'settings-preset',
                presets: [
                    { setting: 'eeg.trace.colorSides', value: true },
                    { setting: 'eeg.trace.color.dex', value: 'rgba(120,0,0,255)' },
                    { setting: 'eeg.trace.color.mid', value: 'rgba(0,120,0,255)' },
                    { setting: 'eeg.trace.color.sin', value: 'rgba(0,0,120,255)' },
                ],
                text: 'Left side blue, right side red, midline green.',
                type: 'preset',
            },
            {
                text: 'Grid options',
                type: 'subtitle',
            },
            {
                text: 'Change the properties of the background grid.',
                type: 'description',
            },
            {
                component: 'settings-checkbox',
                setting: 'eeg.majorGrid.show',
                text: 'Display major grid lines',
                type: 'setting',
            },
            {
                component: 'settings-dropdown',
                setting: 'eeg.majorGrid.width',
                options: [
                    {
                        suffix: ' pixel',
                        value: 1,
                    },
                    {
                        suffix: ' pixels',
                        value: 2,
                    },
                    {
                        suffix: ' pixels',
                        value: 3,
                    },
                ],
                text: 'Width of the major grid',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.majorGrid.color',
                text: 'Color of the major grid lines',
                type: 'setting',
            },
            {
                component: 'settings-checkbox',
                setting: 'eeg.minorGrid.show',
                text: 'Display minor grid lines',
                type: 'setting',
            },
            {
                component: 'settings-dropdown',
                setting: 'eeg.minorGrid.width',
                options: [
                    {
                        suffix: ' pixel',
                        value: 1,
                    },
                    {
                        suffix: ' pixels',
                        value: 2,
                    },
                    {
                        suffix: ' pixels',
                        value: 3,
                    },
                ],
                text: 'Width of the minor grid',
                type: 'setting',
            },
            {
                component: 'settings-colorpicker',
                setting: 'eeg.minorGrid.color',
                text: 'Color of the minor grid lines',
                type: 'setting',
            },
        ],
        name: {
            full: 'Electroencephalography',
            short: 'EEG',
        },
    },
    _userDefinable: {
        'antialiasing': Boolean,
        'channelSpacing': Number,
        'displayPolarity': Number,
        'groupSpacing': Number,
        'filters.highpass.default': Number,
        'filters.lowpass.default': Number,
        'filters.notch.default': Number,
        'majorGrid.color': String,
        'majorGrid.show': Boolean,
        'majorGrid.width': Number,
        'minorGrid.color': String,
        'minorGrid.show': Boolean,
        'minorGrid.width': Number,
        'trace.color.eeg': String,
        'trace.color.dex': String,
        'trace.color.mid': String,
        'trace.color.sin': String,
        'trace.color.ekg': String,
        'trace.color.eog': String,
        'trace.colorSides': Boolean,
    },
    // Display settings
    annotations: {
        color: [0, 0, 1, 0.75] as SettingsColor,
        convertPatterns: [] as [string, BiosignalAnnotation][],
        idColors: {
            'act_ec': [0.25, 0.5, 0.25, 0.75] as SettingsColor,
            'act_eo': [0.25, 0.5, 0.25, 0.75] as SettingsColor,
            'act_hv': [0.6, 0, 0.4, 0.75] as SettingsColor,
            'act_phv': [0.4, 0.2, 0.4, 0.75] as SettingsColor,
            'act_ps': [0.5, 0.5, 0, 0.75] as SettingsColor,
        },
        ignorePatterns: [] as string[],
        typeColors: {
            'activation': [0, 1, 0, 0.75] as SettingsColor,
            'technical': [0.5, 0.5, 0.5, 0.75] as SettingsColor,
        },
        width: 1,
    },
    antialiasing: false,
    border: {
        bottom: {
            color: [0.8, 0.8, 0.8, 1] as SettingsColor,
            style: 'solid',
            width: 2,
        },
        left: {
            color: [0.8, 0.8, 0.8, 1] as SettingsColor,
            style: 'solid',
            width: 2,
        },
    },
    channelSpacing: 1,
    continuousBrowseDelay: 500,
    continuousBrowseInterval: 100,
    cursor: {
        color: [0.5, 0, 0, 0.4] as SettingsColor,
        width: 3,
    },
    defaultMontages: {
        '10-20': [
            ['rec', 'As recorded'],
            ['avg', 'Average reference'],
            ['dbn', 'Double banana'],
            ['trv', 'Transverse'],
            ['lpl', 'Source Laplacian'],
        ] as [string, string][],
    },
    defaultSetups: [
        '10-20',
    ],
    displayPolarity: -1,
    downsampleLimit: 250,
    excludeActiveFromAvg: false,
    fft: {
        frequencyBands: [
            { name: 'delta', symbol: 'δ', upperLimit: 4 },
            { name: 'theta', symbol: 'θ', upperLimit: 8 },
            { name: 'alpha', symbol: 'α', upperLimit: 13 },
            { name: 'beta', symbol: 'β', upperLimit: 30 },
        ],
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
    groupSpacing: 1.5,
    highlights: {
        showCollars: true,
    },
    isoelLine: {
        show: false,
        color: [0.9, 0.9, 0.9, 1] as SettingsColor,
        style: 'solid',
        width: 1,
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
    majorGrid: {
        show: true,
        color: [0, 0, 0, 0.25] as SettingsColor,
        style: 'solid',
        width: 2,
    },
    maxNewSignalCacheCycleLength: 300,
    minNewSignalCacheCycleLength: 60,
    minorGrid: {
        show: true,
        color: [0, 0, 0, 0.15] as SettingsColor,
        style: 'solid',
        width: 1,
    },
    montages: {
        cacheMax: 2,
        preCache: false,
    },
    navigator: {
        annotationColor: [0, 0, 1, 0.5] as SettingsColor,
        borderColor: [0, 0, 0, 0.2] as SettingsColor,
        cachedColor: [0, 0.75, 0, 0.5] as SettingsColor,
        gapColor: [0, 0, 0, 0.1] as SettingsColor,
        loadedColor: [0, 0.35, 0, 0.5] as SettingsColor,
        loadingColor: [0.05, 0.20, 0.05, 0.5] as SettingsColor,
        theme: 'default',
        tickColor: [0, 0, 0, 0.2] as SettingsColor,
        viewBoxColor: [1, 0.2, 0.2, 0.25] as SettingsColor,
    },
    pageLength: 10,
    sensitivity: {
        uVperCm: {
            availableValues: [10, 20, 30, 50, 70, 100, 125, 150, 175, 200, 250, 300, 400, 500, 1000],
            default: 100,
        },
    },
    sensitivityUnit: 'uVperCm',
    showHiddenChannels: false,
    showMissingChannels: false,
    timebase: {
        cmPerS: {
            availableValues: [3],
            default: 3,
        },
    },
    timebaseUnit: 'cmPerS',
    timeline: {
        labelSpacing: 2,
    },
    tools: {
        cursorLine: {
            color: [0.5, 0, 0, 0.4] as SettingsColor,
            style: 'solid',
            width: 2,
        },
        excludeArea: {
            color: [0.5, 0.5, 0.5, 0.2] as SettingsColor,
            style: 'solid',
            width: 1,
        },
        guideLine: {
            color: [0.5, 0.5, 0.5, 0.25] as SettingsColor,
            style: 'solid',
            width: 1,
        },
        guideLineSymbol: {
            color: [0.5, 0.5, 0.5, 0.5] as SettingsColor,
        },
        highlightArea: {
            color: [1, 1, 0.5, 0.5] as SettingsColor,
        },
        poiMarkerLine: {
            color: [0.9, 0.7, 0.6, 1] as SettingsColor,
            dasharray: [2, 1],
            style: 'dashed',
            width: 1,
        },
        poiMarkerCircle: {
            color: [0.9, 0.7, 0.6, 1] as SettingsColor,
            radius: 5,
            style: 'solid',
            width: 2,
        },
        signals: [
            {
                color: [0, 0.4, 0.9, 1] as SettingsColor,
                style: 'solid',
                width: 1,
            },
            {
                color: [0.75, 0, 0.2, 1] as SettingsColor,
                style: 'solid',
                width: 1,
            },
        ],
        signalBaseline: {
            color: [0.9, 0.8, 0.8, 1] as SettingsColor,
            dasharray: [8, 2],
            style: 'dashed',
            width: 1,
        },
    },
    trace: {
        color: {
            eeg: [0, 0, 0, 1] as SettingsColor,
                sin: [0.5, 0, 0, 1] as SettingsColor,
                dex: [0, 0, 0.5, 1] as SettingsColor,
                mid: [0, 0.5, 0, 1] as SettingsColor,
            ekg: [0.75, 0, 0, 1] as SettingsColor,
            emg: [0.3, 0, 0, 1] as SettingsColor,
            eog: [0, 0, 0.75, 1] as SettingsColor,
            res: [0, 0.8, 0, 1] as SettingsColor,
            act: [0.1, 0.1, 0.1, 1] as SettingsColor,
            meta: [0, 0, 0, 0] as SettingsColor, // Hide meta channel signal as failsafe
            default: [0.2, 0.2, 0.2, 1] as SettingsColor,
        },
        colorSides: false,
        highlight: {
            color: [1, 0, 0, 0.2] as SettingsColor,
        },
        selections: {
            color: [0, 0, 1, 0.075] as SettingsColor,
        },
        theme: 'default',
        width: {
            eeg: 1,
            ekg: 1,
            eog: 1,
        },
    },
    yPadding: 1,
}
export default EegSettings