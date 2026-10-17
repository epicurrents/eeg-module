/**
 * Unit tests for the channel-matching patterns of the bundled setups. A setup channel claims the
 * first unclaimed record signal its pattern matches, so a pattern that also matches a neighbouring
 * electrode puts that electrode's trace under the wrong position — with nothing logged, and only in
 * recordings whose signal order happens to put the neighbour first.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import SETUP_1010 from '../src/config/defaults/10-10/setup.json'
import SETUP_1020 from '../src/config/defaults/10-20/setup.json'

type SetupChannelConfig = { name: string, pattern?: string, label?: string, modality?: string }

const SETUPS: [string, SetupChannelConfig[]][] = [
    ['default:10-20', SETUP_1020.channels as SetupChannelConfig[]],
    ['default:10-10', SETUP_1010.channels as SetupChannelConfig[]],
]
/** Pre-1991 temporal names, matched as the positions they were renamed to. */
const OLD_NAMES: Record<string, string> = { T3: 't7', T4: 't8', T5: 'p7', T6: 'p8' }
/** Electrodes outside both setups that a recording may still carry beside them. */
const FOREIGN = ['A1', 'A2', 'M1', 'M2', 'T1', 'T2', 'Zyg1', 'Zyg2', 'Nz', 'Iz', 'Oz', 'Fpz', 'AFz', 'POz']
/** The label shapes an electrode arrives in, with `{}` standing for the electrode. */
const SHAPES = [
    '{}', 'EEG {}', 'EEG {}-REF', 'EEG_{}-Ref', 'EEG{}', "EEG {}'", '{}+', '{}-A1', 'EEG {} Ref', '{} A1',
    'POL {}', 'ECG {}+',
]

/**
 * Index of the setup channel each record signal is claimed by, in the order the setup loader claims them:
 * every setup channel in turn takes the first unclaimed signal with its exact name, failing that the first
 * unclaimed signal its pattern matches.
 */
const claim = (channels: SetupChannelConfig[], labels: string[]) => {
    const claimed = new Map<number, string>()
    for (const chan of channels) {
        let idx = labels.findIndex((l, i) => !claimed.has(i) && l.toLowerCase() === chan.name.toLowerCase())
        if (idx === -1 && chan.pattern) {
            const re = new RegExp(chan.pattern, 'i')
            idx = labels.findIndex((l, i) => !claimed.has(i) && re.test(l))
        }
        if (idx !== -1) {
            claimed.set(idx, chan.name)
        }
    }
    return labels.map((_l, i) => claimed.get(i))
}
const eegChannels = (channels: SetupChannelConfig[]) => channels.filter(c => c.modality === 'eeg')
/** The setup channel name an electrode label belongs to. */
const owner = (electrode: string) => OLD_NAMES[electrode] ?? electrode.toLowerCase()

describe('setup channel patterns', () => {
    for (const [setupName, channels] of SETUPS) {
        describe(setupName, () => {
            const vocabulary = [
                ...new Set([
                    ...SETUPS.flatMap(([, chans]) => eegChannels(chans).map(c => c.label as string)),
                    ...Object.keys(OLD_NAMES),
                    ...FOREIGN,
                ]),
            ]

            test('every pattern compiles', () => {
                for (const chan of channels) {
                    expect(() => new RegExp(chan.pattern ?? '', 'i'), chan.name).not.toThrow()
                }
            })

            test('an electrode matches its own label in every shape it arrives in', () => {
                for (const chan of eegChannels(channels)) {
                    const re = new RegExp(chan.pattern as string, 'i')
                    const oldNames = Object.keys(OLD_NAMES).filter(n => OLD_NAMES[n] === chan.name)
                    const names = [chan.label as string, ...oldNames]
                    for (const name of names) {
                        for (const shape of SHAPES) {
                            expect(re.test(shape.replace('{}', name)), `${chan.name}: ${shape.replace('{}', name)}`)
                                .toBe(true)
                        }
                    }
                }
            })

            test('no electrode matches the label of another electrode', () => {
                for (const chan of eegChannels(channels)) {
                    const re = new RegExp(chan.pattern as string, 'i')
                    for (const electrode of vocabulary) {
                        if (owner(electrode) === chan.name) {
                            continue
                        }
                        for (const shape of SHAPES) {
                            const label = shape.replace('{}', electrode)
                            expect(re.test(label), `${chan.name} claims ${label}`).toBe(false)
                        }
                    }
                }
            })

            test('no electrode matches the reference half of a label', () => {
                for (const chan of eegChannels(channels)) {
                    if (chan.name === 'fp1') {
                        continue
                    }
                    const re = new RegExp(chan.pattern as string, 'i')
                    expect(re.test(`EEG Fp1-${chan.label}`), chan.name).toBe(false)
                    expect(re.test(`EEG Fp1 ${chan.label}`), chan.name).toBe(false)
                }
            })

            test('a label declaring another modality is not read as an electrode', () => {
                for (const chan of eegChannels(channels)) {
                    const re = new RegExp(chan.pattern as string, 'i')
                    for (const prefix of ['EMG', 'EOG', 'RESP']) {
                        expect(re.test(`${prefix} ${chan.label}`), `${prefix} ${chan.label}`).toBe(false)
                    }
                }
            })

            test.each([
                // ECG, single channel or a pair already stored as a bipolar derivation.
                ['ECG', 'ekg'], ['EKG', 'ekg'], ['ECG1', 'ekg'], ['ECG II', 'ekg'], ['II', 'ekg'],
                ['POL ECG', 'ekg'], ['ECG EKG+', 'ekg'], ['ECG L-ECG R', 'ekg'], ['ECG1-ECG2', 'ekg'],
                // ECG sides, from which the montages derive a bipolar trace.
                ['ECG L', 'ecgl'], ['ECGL', 'ecgl'], ['EKG Left', 'ecgl'], ['ECG ECG L', 'ecgl'],
                ['ECG R', 'ecgr'], ['ECGR', 'ecgr'], ['EKG Right', 'ecgr'], ['ECG-L', 'ecgl'], ['ECG-R', 'ecgr'],
                // EOG, with the side where one is named.
                ['EOG', 'eog'], ['ECG EOG+', 'eog'], ['LOC', 'loc'], ['E1', 'loc'], ['EOG L', 'loc'],
                ['LOC-A2', 'loc'], ['POL LOC', 'loc'], ['ROC', 'roc'], ['E2', 'roc'], ['EOG R', 'roc'],
                // EMG.
                ['EMG', 'emg'], ['EMG Chin', 'emg'], ['EMG/Chin', 'emg'], ['Chin1', 'emg'], ['ECG emg1+', 'emg'],
                ['EMG L Tib', 'emg'], ['EMG F7', 'emg'],
                // Respiration.
                ['RESP', 'res'], ['Resp Chest', 'res'], ['Thorax', 'res'], ['Abdomen', 'res'],
                ['Airflow', 'res'], ['POL Resp', 'res'],
                // Photic stimulation, which commonly arrives in EEG's clothes.
                ['Photic', 'ps'], ['EEG Photic-Ref', 'ps'], ['POL Photic', 'ps'], ['Photic Stim', 'ps'],
                ['EDF Annotations', 'annotations'],
                // Labels no channel may take.
                ['Proc', undefined], ['Block', undefined], ['Pressure', undefined], ['EOG Fp1', undefined],
                ['Value MKR+', undefined], ['DC01', undefined], ['SpO2', undefined], ['Snore', undefined],
            ])('%s is claimed by %s', (label, expected) => {
                expect(claim(channels, [label])[0]).toBe(expected)
            })
        })
    }

    test('an export prefixing every polygraphic channel with ECG and marking positions with a prime', () => {
        const labels = [
            "EEG Fp1'", "EEG F3'", "EEG F7'", "EEG C3'", "EEG T3'", "EEG P3'", "EEG T5'", "EEG O1'",
            "EEG Fp2'", "EEG F4'", "EEG F8'", "EEG C4'", "EEG T4'", "EEG P4'", "EEG T6'", "EEG O2'",
            "EEG Fz'", "EEG Cz'", "EEG Pz'", "EEG Oz'", "EEG FT9'", "EEG Zyg1'", "EEG FT10'", "EEG Zyg2'",
            'ECG EOG+', 'ECG EKG+', 'ECG emg1+', 'ECG emg2+', 'ECG emg3+', 'ECG emg4+', 'Value MKR+',
            'EDF Annotations',
        ]
        const expected = [
            'fp1', 'f3', 'f7', 'c3', 't7', 'p3', 'p7', 'o1',
            'fp2', 'f4', 'f8', 'c4', 't8', 'p4', 'p8', 'o2',
            'fz', 'cz', 'pz', undefined, 'ft9', undefined, 'ft10', undefined,
            'eog', 'ekg', 'emg', undefined, undefined, undefined, undefined,
            'annotations',
        ]
        expect(claim(SETUP_1020.channels as SetupChannelConfig[], labels)).toEqual(expected)
        // The 10-10 array also has a position for Oz.
        expected[19] = 'oz'
        expect(claim(SETUP_1010.channels as SetupChannelConfig[], labels)).toEqual(expected)
    })
})
