/**
 * Unit tests for EegMontageChannel, a thin wrapper whose one job is to carry the montage's channel
 * properties through to the generic base.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import type { BiosignalMontage } from '@epicurrents/core/types'
import EegMontageChannel from '../src/components/EegMontageChannel'

describe('EegMontageChannel', () => {
    test('carries its identity and signal properties through to the base', () => {
        const channel = new EegMontageChannel(
            {} as BiosignalMontage, 'C3-P3', 'C3-P3', 'eeg', 1, [], false, 256, 'uV', true, {}
        )
        expect(channel).toBeInstanceOf(EegMontageChannel)
        expect(channel.name).toBe('C3-P3')
        expect(channel.label).toBe('C3-P3')
        expect(channel.modality).toBe('eeg')
        expect(channel.samplingRate).toBe(256)
        expect(channel.unit).toBe('uV')
        expect(channel.visible).toBe(true)
    })
})
