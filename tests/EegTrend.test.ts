/**
 * Unit tests for the EEG trend classes: what each type fixes about its own computation, and the
 * contract that a trend reaches its service only once its derivation names real channels.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test, vi } from 'vitest'
import type { BiosignalSetup, BiosignalTrendService } from '@epicurrents/core/types'
import EegAmplitudeIntegratedTrend from '../src/components/EegAmplitudeIntegratedTrend'
import EegFrequencyRatioTrend from '../src/components/EegFrequencyRatioTrend'
import EegPdBsiTrend from '../src/components/EegPdBsiTrend'
import EegSpectrogramTrend from '../src/components/EegSpectrogramTrend'
import EegTrend from '../src/components/EegTrend'

const serviceStub = () => ({ setupTrend: vi.fn().mockResolvedValue(true) } as unknown as
    BiosignalTrendService & { setupTrend: ReturnType<typeof vi.fn> })

const setupOf = (...names: string[]) => ({
    channels: names.map((name, i) => ({ name, index: 10 + i })),
} as unknown as BiosignalSetup)

describe('EegTrend.tryResolveDerivation', () => {
    test('takes the first candidate that resolves, not the first that is listed', () => {
        const service = serviceStub()
        const trend = new EegTrend('t', 'T', 'amplitude', service, { epochLength: 5 })
        // C3 is absent, so the second candidate is the one the recording can feed.
        expect(trend.tryResolveDerivation(setupOf('P3', 'P4'), [
            { source: 'C3', reference: '' },
            { source: 'P3', reference: '' },
        ])).toBe(true)
        expect(trend.derivation.sourceChannels).toEqual([10])
    })

    test('registers with the service once the derivation resolves, and not before', () => {
        // An unresolved trend registered anyway would have the worker compute over source channel
        // indices that name nothing.
        const service = serviceStub()
        const trend = new EegTrend('t', 'T', 'amplitude', service, { epochLength: 5 })
        expect(service.setupTrend).not.toHaveBeenCalled()
        expect(trend.tryResolveDerivation(setupOf('C3'), [{ source: 'C3', reference: '' }])).toBe(true)
        expect(service.setupTrend).toHaveBeenCalledTimes(1)
        expect(service.setupTrend.mock.calls[0][1]).toMatchObject({ sourceChannels: [10] })
    })

    test('a failure to resolve leaves the trend unregistered and its channels empty', () => {
        const service = serviceStub()
        const trend = new EegTrend('t', 'T', 'amplitude', service, { epochLength: 5 })
        expect(trend.tryResolveDerivation(setupOf('C3'), [{ source: 'T5', reference: 'T6' }])).toBe(false)
        expect(service.setupTrend).not.toHaveBeenCalled()
        expect(trend.derivation.sourceChannels).toEqual([])
    })

    test('an empty setup and an empty candidate list both resolve to false', () => {
        const service = serviceStub()
        const trend = new EegTrend('t', 'T', 'amplitude', service, { epochLength: 5 })
        expect(trend.tryResolveDerivation(setupOf(), [{ source: 'C3', reference: '' }])).toBe(false)
        expect(trend.tryResolveDerivation(setupOf('C3'), [])).toBe(false)
    })

    test('the resolved derivation keeps its type and carries the average-reference choice', () => {
        const service = serviceStub()
        const trend = new EegTrend('t', 'T', 'ratio', service, { epochLength: 2 })
        trend.tryResolveDerivation(setupOf('C3'), [{ source: 'C3', reference: '' }], { averageReference: true })
        expect(trend.derivation).toMatchObject({ type: 'ratio', averageReference: true })
    })

    test('average referencing is off unless the caller asks for it', () => {
        // The amplitude builder passes no options, and a common average applied behind its back
        // changes the amplitude the trend reports.
        const service = serviceStub()
        const trend = new EegTrend('t', 'T', 'amplitude', service, { epochLength: 5 })
        trend.tryResolveDerivation(setupOf('C3'), [{ source: 'C3', reference: '' }])
        expect(trend.derivation.averageReference).toBe(false)
    })
})

describe('EegPdBsiTrend.tryResolvePairs', () => {
    test('resolves the pairs the setup can feed and registers once', () => {
        const service = serviceStub()
        const trend = new EegPdBsiTrend('pdbsi', 'pdBSI', service, { epochLength: 2, band: [1, 4] })
        expect(trend.tryResolvePairs(setupOf('C3', 'C4', 'P3'), [
            { left: 'C3', right: 'C4' },
            { left: 'P3', right: 'P4' },
        ])).toBe(true)
        expect(trend.derivation.pairs).toEqual([[10, 11]])
        expect(service.setupTrend).toHaveBeenCalledTimes(1)
    })

    test('no resolvable pair leaves the trend unregistered', () => {
        const service = serviceStub()
        const trend = new EegPdBsiTrend('pdbsi', 'pdBSI', service, { epochLength: 2, band: [1, 4] })
        expect(trend.tryResolvePairs(setupOf('C3'), [{ left: 'T5', right: 'T6' }])).toBe(false)
        expect(service.setupTrend).not.toHaveBeenCalled()
    })

    test('average referencing defaults on, since one noisy electrode otherwise biases a hemisphere', () => {
        const service = serviceStub()
        const trend = new EegPdBsiTrend('pdbsi', 'pdBSI', service, { epochLength: 2, band: [1, 4] })
        trend.tryResolvePairs(setupOf('C3', 'C4'), [{ left: 'C3', right: 'C4' }])
        expect(trend.derivation.averageReference).toBe(true)
        expect(service.setupTrend.mock.calls[0][4]).toMatchObject({ band: [1, 4] })
    })
})

describe('trend type defaults', () => {
    test('the sampling rate is one sample per epoch for every type', () => {
        // The renderer reads the epoch length off the sampling rate, so the two must agree or the
        // trend is drawn against the wrong time axis.
        const service = serviceStub()
        const amplitude = new EegAmplitudeIntegratedTrend('a', 'A', service, { epochLength: 10 })
        expect(amplitude.samplingRate).toBe(1/10)
        expect(amplitude.derivation.type).toBe('amplitude')
        const ratio = new EegFrequencyRatioTrend('r', 'R', service, {
            epochLength: 4, numeratorBand: [4, 8], denominatorBand: [8, 13],
        })
        expect(ratio.samplingRate).toBe(1/4)
        expect(ratio.derivation.type).toBe('ratio')
        const spectrogram = new EegSpectrogramTrend('s', 'S', service, {
            epochLength: 5, frequencyBins: 30, maxFreqHz: 30,
        })
        expect(spectrogram.samplingRate).toBe(1/5)
        expect(spectrogram.derivation.type).toBe('spectrogram')
    })

    test('each type carries its own math parameters through to the service', () => {
        const service = serviceStub()
        const ratio = new EegFrequencyRatioTrend('r', 'R', service, {
            epochLength: 2, numeratorBand: [4, 8], denominatorBand: [8, 13],
        })
        ratio.tryResolveDerivation(setupOf('C3'), [{ source: 'C3', reference: '' }])
        expect(service.setupTrend.mock.calls[0][4]).toMatchObject({
            numeratorBand: [4, 8], denominatorBand: [8, 13],
        })
    })

    test('the spectrogram keeps its bin count and carries its ceiling to the service', () => {
        const service = serviceStub()
        const spectrogram = new EegSpectrogramTrend('s', 'S', service, {
            epochLength: 5, frequencyBins: 30, maxFreqHz: 30,
        })
        expect(spectrogram.frequencyBins).toBe(30)
        spectrogram.tryResolveDerivation(setupOf('C3'), [{ source: 'C3', reference: '' }])
        expect(service.setupTrend.mock.calls[0][4]).toMatchObject({ maxFreqHz: 30 })
    })

    test('construction alone registers nothing, which is why tryResolveDerivation has to', () => {
        // Every EEG trend is constructed with an empty derivation and resolved afterwards, so the
        // base class's constructor-time registration never fires for one.
        const service = serviceStub()
        new EegTrend('t', 'T', 'amplitude', service, { epochLength: 5 })
        expect(service.setupTrend).not.toHaveBeenCalled()
    })
})
