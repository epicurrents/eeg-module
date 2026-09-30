/**
 * Unit tests for EegSourceChannel, whose one piece of behaviour is deriving a channel's laterality
 * from its name when the setup did not state one.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import EegSourceChannel from '../src/components/EegSourceChannel'

const lateralityOf = (name: string, modality = 'eeg', extra = {}) =>
    (new EegSourceChannel(name, name, modality, 0, false, 256, 'uV', true, extra) as unknown as
        { _laterality: string })._laterality

describe('EegSourceChannel laterality', () => {
    test('an odd electrode number is the left side and an even one the right', () => {
        // The 10-20 convention: odd left, even right. Getting this backwards mirrors every
        // laterality-aware display of the recording.
        expect(lateralityOf('C3')).toBe('s')
        expect(lateralityOf('C4')).toBe('d')
        expect(lateralityOf('Fp1')).toBe('s')
        expect(lateralityOf('Fp2')).toBe('d')
        expect(lateralityOf('T5')).toBe('s')
        expect(lateralityOf('T6')).toBe('d')
    })

    test('a midline electrode is named for it rather than numbered', () => {
        expect(lateralityOf('Cz')).toBe('z')
        expect(lateralityOf('Fz')).toBe('z')
        expect(lateralityOf('FPZ')).toBe('z')
    })

    test('a two-digit number is read whole', () => {
        // 10-05 labels run into two digits, and reading only the first would call every one of them
        // by the wrong side.
        expect(lateralityOf('AF10')).toBe('d')
        expect(lateralityOf('PO11')).toBe('s')
    })

    test('a name with no number and no midline marker is left unassigned', () => {
        // A guess here would assert a side for a channel that has none, which is worse than leaving
        // the display to say nothing.
        expect(lateralityOf('EKG')).toBeFalsy()
        expect(lateralityOf('Photic')).toBeFalsy()
    })

    test('a referenced label takes its side from the active electrode', () => {
        expect(lateralityOf('C3-A2')).toBe('s')
        expect(lateralityOf('C4-A1')).toBe('d')
    })

    test('a laterality the setup already stated is not overwritten', () => {
        expect(lateralityOf('C3', 'eeg', { laterality: 'd' })).toBe('d')
    })

    test('a non-EEG channel gets no derived laterality', () => {
        // The odd/even convention is the electrode system's, so it says nothing about an EKG lead or
        // a respiration belt that happens to carry a number.
        expect(lateralityOf('EKG1', 'ekg')).toBeFalsy()
        expect(lateralityOf('RES2', 'res')).toBeFalsy()
    })
})
