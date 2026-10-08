/**
 * Unit tests for the trend build pipeline on EegRecording, and for the setup registration it depends
 * on. Every gate here fails quietly by design — an unbuilt trend logs a debug line and the strip
 * simply stays empty — so the gates are worth pinning rather than the arithmetic.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BiosignalChannel, ConfigBiosignalSetup } from '@epicurrents/core/types'
import { Log } from 'scoped-event-log'
import EegRecording from '../src/EegRecording'
import EegSpectrogramTrend from '../src/components/EegSpectrogramTrend'

;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = {
    RUNTIME: { SETTINGS: { modules: { eeg: {} }, app: {} } },
}

const CHANNELS = [
    { name: 'C3', label: 'C3', modality: 'eeg', averaged: false, samplingRate: 256, unit: 'uV',
      visible: true, sampleCount: 2560 },
    { name: 'C4', label: 'C4', modality: 'eeg', averaged: false, samplingRate: 256, unit: 'uV',
      visible: true, sampleCount: 2560 },
] as unknown as BiosignalChannel[]

const DERIVATIONS = [
    { id: 'left', label: 'Left', color: [0, 0, 1, 1], candidates: [{ source: 'C3', reference: '' }] },
    { id: 'right', label: 'Right', color: [1, 0, 0, 1], candidates: [{ source: 'C4', reference: '' }] },
]

type Internals = {
    _SETTINGS: unknown
    _samplingRate: number | null
    _setup: unknown
    _signalCacheStatus: number[]
    _trendService: unknown
    _trendServiceUnavailable: string | null
    _initTrendService: () => Promise<void>
    _trends: Map<string, unknown>
    _trendsEnabled: Set<string>
    _buildAmplitudeTrends: () => void
    _buildPdBsiTrends: () => void
    _buildRatioTrends: () => void
    _buildSpectrogramTrends: () => void
    _extendTrendsToCache: (end: number) => void
    _scheduleTrendSetup: () => void
    _setupTrend: (trend: unknown, initialCachedEnd: number) => void
    _trendDerivations: (own?: unknown[]) => unknown[]
}

const makeRecording = (settings: Record<string, unknown> = {}, channels = CHANNELS) => {
    const rec = new EegRecording(
        'r',
        channels,
        { recordingStartTime: 0, dataUnitCount: 10, dataUnitDuration: 1 } as never,
        { addEventListener: () => undefined } as never,
    )
    const internals = rec as unknown as Internals
    internals._SETTINGS = {
        events: { ignorePatterns: [], convertPatterns: [] },
        trends: { amplitude: { epochLength: 5 }, spectrogram: { epochLength: 5 },
                  ratio: { epochLength: 5 }, pdbsi: { epochLength: 5 } },
        aeeg: { autoCompute: false, derivations: DERIVATIONS },
        pdbsi: { pairs: [{ left: 'C3', right: 'C4' }] },
        ...settings,
    }
    internals._setup = { channels: CHANNELS.map((c, i) => ({ name: c.name, index: i })) }
    internals._trendService = { setupTrend: vi.fn().mockResolvedValue(true) }
    internals._signalCacheStatus = [0, 100]
    internals._samplingRate = 256
    return { rec, internals }
}

describe('_trendDerivations', () => {
    test('a type with no derivations of its own reuses the aEEG list', () => {
        const { internals } = makeRecording()
        expect(internals._trendDerivations()).toBe(DERIVATIONS)
        // An empty list counts as declaring none, not as declaring zero derivations.
        expect(internals._trendDerivations([])).toBe(DERIVATIONS)
    })

    test('a type that declares its own derivations keeps them', () => {
        const { internals } = makeRecording()
        const own = [{ id: 'own', label: 'Own', color: [0, 0, 0, 1], candidates: [] }]
        expect(internals._trendDerivations(own)).toBe(own)
    })

    test('an empty list is the answer when neither side configures one', () => {
        const { internals } = makeRecording({ aeeg: undefined })
        expect(internals._trendDerivations()).toEqual([])
    })
})

describe('_buildAmplitudeTrends', () => {
    test('builds one trend per resolvable derivation once the type is enabled', () => {
        const { internals } = makeRecording()
        internals._trendsEnabled.add('amplitude')
        internals._buildAmplitudeTrends()
        expect([...internals._trends.keys()]).toEqual(['aeeg-left', 'aeeg-right'])
    })

    test('builds nothing until a type is requested or autoCompute is on', () => {
        // The strip is closed by default and the per-epoch compute shares the montage worker, so an
        // unrequested trend must not start computing on its own.
        const { internals } = makeRecording()
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(0)
    })

    test('autoCompute builds without a request', () => {
        const { internals } = makeRecording({
            aeeg: { autoCompute: true, derivations: DERIVATIONS },
        })
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(2)
    })

    test('skips a derivation no candidate resolves and keeps the others', () => {
        const { internals } = makeRecording({
            aeeg: { autoCompute: true, derivations: [
                DERIVATIONS[0],
                { id: 'absent', label: 'Absent', color: [0, 0, 0, 1],
                  candidates: [{ source: 'T5', reference: 'T6' }] },
            ] },
        })
        internals._buildAmplitudeTrends()
        expect([...internals._trends.keys()]).toEqual(['aeeg-left'])
    })

    test('builds nothing without a setup to resolve against', () => {
        const { internals } = makeRecording()
        internals._trendsEnabled.add('amplitude')
        internals._setup = null
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(0)
    })

    test('builds nothing before the trend service exists', () => {
        // The trend worker reads the shared buffer directly, so there is nothing to compute against
        // until the service is up.
        const { internals } = makeRecording()
        internals._trendsEnabled.add('amplitude')
        internals._trendService = null
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(0)
    })

    test('builds nothing while less than one epoch is cached', () => {
        const { internals } = makeRecording()
        internals._trendsEnabled.add('amplitude')
        internals._signalCacheStatus = [0, 4]
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(0)
    })

    test('builds nothing when no epoch length can be derived', () => {
        const { internals } = makeRecording({ trends: { amplitude: { epochLength: 0 } } })
        internals._trendsEnabled.add('amplitude')
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(0)
    })

    test('a second pass adds nothing, so repeated setup does not duplicate a trend', () => {
        const { internals } = makeRecording()
        internals._trendsEnabled.add('amplitude')
        internals._buildAmplitudeTrends()
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(2)
    })

    test('a spectrogram already in the map does not block an amplitude build', () => {
        // The two types coexist briefly while the user switches between them, and checking only for
        // "any trend" would leave the second type unbuilt.
        const { internals } = makeRecording()
        internals._trendsEnabled.add('spectrogram')
        internals._buildSpectrogramTrends()
        expect(internals._trends.size).toBe(2)
        internals._trendsEnabled.add('amplitude')
        internals._buildAmplitudeTrends()
        expect(internals._trends.size).toBe(4)
    })
})

describe('the other three trend types', () => {
    test('each builds only once its own type is requested', () => {
        // None of the three auto-computes: only the aEEG setting grants that.
        for (const [type, build, names] of [
            ['spectrogram', '_buildSpectrogramTrends', ['spectrogram-left', 'spectrogram-right']],
            ['ratio', '_buildRatioTrends', ['ratio-left', 'ratio-right']],
            ['pdbsi', '_buildPdBsiTrends', ['pdbsi']],
        ] as [string, keyof Internals, string[]][]) {
            const { internals } = makeRecording({ aeeg: { autoCompute: true, derivations: DERIVATIONS } })
            ;(internals[build] as () => void)()
            expect(internals._trends.size, type).toBe(0)
            internals._trendsEnabled.add(type)
            ;(internals[build] as () => void)()
            expect([...internals._trends.keys()], type).toEqual(names)
        }
    })

    test('pdBSI builds one trend across every configured pair', () => {
        const { internals } = makeRecording()
        internals._trendsEnabled.add('pdbsi')
        internals._buildPdBsiTrends()
        expect(internals._trends.size).toBe(1)
        expect((internals._trends.get('pdbsi') as { derivation: { pairs: number[][] } }).derivation.pairs)
            .toEqual([[0, 1]])
    })

    test('pdBSI builds nothing when no pair resolves', () => {
        const { internals } = makeRecording({ pdbsi: { pairs: [{ left: 'T5', right: 'T6' }] } })
        internals._trendsEnabled.add('pdbsi')
        internals._buildPdBsiTrends()
        expect(internals._trends.size).toBe(0)
    })

    test('pdBSI builds nothing with no pairs configured at all', () => {
        const { internals } = makeRecording({ pdbsi: { pairs: [] } })
        internals._trendsEnabled.add('pdbsi')
        internals._buildPdBsiTrends()
        expect(internals._trends.size).toBe(0)
    })
})

describe('the spectrogram sampling-rate gate', () => {
    test('builds nothing while the recording sampling rate is unknown', () => {
        // The bin layout is computed against the input rate, so building without one would lay the
        // output out against a rate nobody has stated.
        const { internals } = makeRecording()
        internals._trendsEnabled.add('spectrogram')
        internals._samplingRate = null
        internals._buildSpectrogramTrends()
        expect(internals._trends.size).toBe(0)
    })
})

describe('_scheduleTrendSetup', () => {
    test('schedules nothing when no type is requested and none auto-computes', async () => {
        // Cache progress calls this on every update, so a closed strip must not queue a microtask per
        // update for the whole load.
        const { internals } = makeRecording()
        const spy = vi.spyOn(internals, '_buildAmplitudeTrends')
        internals._scheduleTrendSetup()
        await Promise.resolve()
        expect(spy).not.toHaveBeenCalled()
    })

    test('coalesces repeated calls in one turn into a single build pass', () => {
        const { internals } = makeRecording()
        internals._trendsEnabled.add('amplitude')
        const spy = vi.spyOn(internals, '_buildAmplitudeTrends')
        internals._scheduleTrendSetup()
        internals._scheduleTrendSetup()
        internals._scheduleTrendSetup()
        return Promise.resolve().then(() => {
            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    test('autoCompute alone is enough to schedule', async () => {
        const { internals } = makeRecording({ aeeg: { autoCompute: true, derivations: DERIVATIONS } })
        const spy = vi.spyOn(internals, '_buildAmplitudeTrends')
        internals._scheduleTrendSetup()
        await Promise.resolve()
        expect(spy).toHaveBeenCalledTimes(1)
    })
})

describe('ensureTrendSetup and clearTrendTypes', () => {
    test('a requested type stays requested across later passes', () => {
        const { rec, internals } = makeRecording()
        rec.ensureTrendSetup('ratio')
        expect(internals._trendsEnabled.has('ratio')).toBe(true)
        rec.ensureTrendSetup('ratio')
        expect(internals._trendsEnabled.size).toBe(1)
    })

    test('amplitude is the type requested by default', () => {
        const { rec, internals } = makeRecording()
        rec.ensureTrendSetup()
        expect(internals._trendsEnabled.has('amplitude')).toBe(true)
    })

    test('clearing forgets every requested type', () => {
        const { rec, internals } = makeRecording()
        rec.ensureTrendSetup('ratio')
        rec.ensureTrendSetup('pdbsi')
        rec.clearTrendTypes()
        expect(internals._trendsEnabled.size).toBe(0)
    })
})

describe('_setupTrend and _extendTrendsToCache', () => {
    // A recording long enough that the cached spans below end before it does.
    const makeLongRecording = (totalDuration = 100) => {
        const made = makeRecording()
        made.rec.totalDuration = totalDuration
        return made
    }
    const trendStub = (name: string, epochLength: number, computedUpToSec = 0, epochStep = epochLength) => ({
        name, epochLength, epochStep, computedUpToSec,
        addEventListener: vi.fn(),
        cancelTrendComputation: vi.fn(),
        computeTrend: vi.fn().mockResolvedValue(undefined),
        derivation: { type: 'amplitude' },
    })

    test('the initial compute is aligned down to a whole epoch', () => {
        // A partial epoch computed as a whole one reports a value over less signal than it claims.
        const { internals } = makeLongRecording()
        const trend = trendStub('t', 5)
        internals._setupTrend(trend, 47)
        expect(trend.computeTrend).toHaveBeenCalledWith([0, 45])
    })

    test('nothing is computed before a whole epoch is available', () => {
        const { internals } = makeLongRecording()
        const trend = trendStub('t', 5)
        internals._setupTrend(trend, 4)
        expect(trend.computeTrend).not.toHaveBeenCalled()
    })

    test('a stale trend of the same name is replaced rather than refused', () => {
        // `addTrend` refuses a duplicate name, so a rebuild that did not remove the old one first
        // would silently keep computing into the trend it meant to replace.
        const { internals } = makeLongRecording()
        const first = trendStub('t', 5)
        const second = trendStub('t', 5)
        internals._setupTrend(first, 10)
        internals._setupTrend(second, 10)
        expect(internals._trends.get('t')).toBe(second)
        expect(first.cancelTrendComputation).toHaveBeenCalled()
    })

    test('extending computes only the span past what the trend already holds', () => {
        const { internals } = makeLongRecording()
        const trend = trendStub('t', 5, 20)
        internals._trends.set('t', trend)
        internals._extendTrendsToCache(37)
        expect(trend.computeTrend).toHaveBeenCalledWith([20, 35])
    })

    test('a trend already covering the cached span is left alone', () => {
        const { internals } = makeLongRecording()
        const trend = trendStub('t', 5, 35)
        internals._trends.set('t', trend)
        internals._extendTrendsToCache(37)
        expect(trend.computeTrend).not.toHaveBeenCalled()
    })

    test('overlapping epochs extend to the end of the last whole window', () => {
        // 3 s windows every 0.5 s: with 12.2 s cached the last whole window ends at 12.
        const { internals } = makeLongRecording()
        const trend = trendStub('t', 3, 10, 0.5)
        internals._trends.set('t', trend)
        internals._extendTrendsToCache(12.2)
        expect(trend.computeTrend).toHaveBeenCalledWith([10, 12])
    })

    test('each trend is extended on its own epoch grid', () => {
        const { internals } = makeLongRecording()
        const coarse = trendStub('coarse', 10, 0)
        const fine = trendStub('fine', 2, 0)
        internals._trends.set('coarse', coarse)
        internals._trends.set('fine', fine)
        internals._extendTrendsToCache(37)
        expect(coarse.computeTrend).toHaveBeenCalledWith([0, 30])
        expect(fine.computeTrend).toHaveBeenCalledWith([0, 36])
    })

    test('the final partial epochs are computed once the cache reaches the end of the recording', () => {
        // 47 s in 5 s epochs: the last epoch starts at 45 and is partial. Stopping at the last whole epoch would
        // leave the trend short of the end of the recording for good, since no more signal arrives.
        const { internals } = makeLongRecording(47)
        const trend = trendStub('t', 5, 45)
        internals._trends.set('t', trend)
        internals._extendTrendsToCache(47)
        expect(trend.computeTrend).toHaveBeenCalledWith([45, 47])
    })

    test('a fully cached recording is computed to its end on setup', () => {
        const { internals } = makeLongRecording(12.2)
        const trend = trendStub('t', 3, 0, 0.5)
        internals._setupTrend(trend, 12.2)
        expect(trend.computeTrend).toHaveBeenCalledWith([0, 12.2])
    })

    test('a fully cached recording shorter than one epoch still gets its single partial epoch', () => {
        const { internals } = makeLongRecording(4)
        const trend = trendStub('t', 5)
        internals._setupTrend(trend, 4)
        expect(trend.computeTrend).toHaveBeenCalledWith([0, 4])
    })
})

describe('addSetup', () => {
    const config = (name: string) => ({ name } as ConfigBiosignalSetup)
    /** A recording with no setup attached yet, which is the state `addSetup` resolves a rate in. */
    const unsetupRecording = () => {
        const made = makeRecording()
        made.internals._setup = null
        return made
    }

    test('returns the existing setup on a name collision rather than a second one', () => {
        const { rec } = unsetupRecording()
        const first = rec.addSetup(config('s1'), CHANNELS)
        expect(rec.addSetup(config('s1'), CHANNELS)).toBe(first)
    })

    test('records the common EEG sampling rate on the first setup', () => {
        const { rec } = unsetupRecording()
        rec.addSetup(config('s1'), CHANNELS)
        expect(rec.samplingRate).toBe(256)
    })

    test('reports no common rate when the EEG channels disagree', () => {
        // A single rate is what the montage math and the trend epochs are computed against, so a mixed
        // recording has to answer null rather than whichever rate came first.
        const { rec } = unsetupRecording()
        rec.addSetup(config('s1'), [
            { ...CHANNELS[0] },
            { ...CHANNELS[1], samplingRate: 512 },
        ] as unknown as BiosignalChannel[])
        expect(rec.samplingRate).toBeNull()
    })

    test('non-EEG channels do not affect the common rate', () => {
        const { rec } = unsetupRecording()
        rec.addSetup(config('s1'), [
            { ...CHANNELS[0] },
            { ...CHANNELS[1], modality: 'ekg', samplingRate: 500 },
        ] as unknown as BiosignalChannel[])
        expect(rec.samplingRate).toBe(256)
    })

    test('only the first setup becomes the active one', () => {
        const { rec, internals } = unsetupRecording()
        const first = rec.addSetup(config('s1'), CHANNELS)
        rec.addSetup(config('s2'), CHANNELS)
        expect(internals._setup).toBe(first)
    })
})

describe('a missing trend service', () => {
    /** Give the recording a data cache without a shared buffer, the way a page without isolation gets one. */
    const withoutSharedCache = (rec: EegRecording) => {
        Object.defineProperty(rec, 'dataCache', { value: { outputSignalSamplingRates: [] } })
    }

    test('names cross-origin isolation when the page is not isolated', async () => {
        vi.stubGlobal('crossOriginIsolated', false)
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const { rec, internals } = makeRecording()
        internals._trendService = null
        withoutSharedCache(rec)
        await internals._initTrendService()
        expect(internals._trendService).toBeNull()
        expect(internals._trendServiceUnavailable).toContain('cross-origin isolated')
        expect(warn).toHaveBeenCalledTimes(1)

        // A later request repeats the reason rather than suggesting the service is on its way.
        internals._trendsEnabled.add('spectrogram')
        internals._buildSpectrogramTrends()
        expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('cross-origin isolated'), expect.anything())
        expect(warn.mock.calls.flat().join(' ')).not.toContain('not initialised')
        warn.mockRestore()
        vi.unstubAllGlobals()
    })

    test('does not blame isolation on an isolated page', async () => {
        vi.stubGlobal('crossOriginIsolated', true)
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const { rec, internals } = makeRecording()
        internals._trendService = null
        withoutSharedCache(rec)
        await internals._initTrendService()
        expect(internals._trendServiceUnavailable).toBe('the signal cache is not backed by shared memory')
        warn.mockRestore()
        vi.unstubAllGlobals()
    })

    test('is only a debug note while setup has not reached it', () => {
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const debug = vi.spyOn(Log, 'debug').mockImplementation(() => undefined)
        const { internals } = makeRecording()
        internals._trendService = null
        internals._trendsEnabled.add('ratio')
        internals._buildRatioTrends()
        expect(warn).not.toHaveBeenCalled()
        expect(debug).toHaveBeenCalledWith(expect.stringContaining('still being set up'), expect.anything())
        warn.mockRestore()
        debug.mockRestore()
    })
})

describe('overlapping epochs', () => {
    type StepTrend = { epochLength: number, epochStep: number, samplingRate: number }

    test('a configured step reaches the trend, which then yields a value per step', () => {
        const { internals } = makeRecording({
            trends: { spectrogram: { epochLength: 3, epochStep: 0.5 } },
        })
        internals._trendsEnabled.add('spectrogram')
        internals._buildSpectrogramTrends()
        const trend = internals._trends.get('spectrogram-left') as StepTrend
        expect([trend.epochLength, trend.epochStep, trend.samplingRate]).toEqual([3, 0.5, 2])
    })

    test('no step configured means back-to-back epochs', () => {
        const { internals } = makeRecording({ trends: { spectrogram: { epochLength: 3 } } })
        internals._trendsEnabled.add('spectrogram')
        internals._buildSpectrogramTrends()
        const trend = internals._trends.get('spectrogram-left') as StepTrend
        expect([trend.epochStep, trend.samplingRate]).toEqual([3, 1 / 3])
    })

    test('the first computation covers only whole windows of the cached signal', () => {
        const compute = vi.spyOn(EegSpectrogramTrend.prototype, 'computeTrend').mockResolvedValue(undefined)
        const { internals } = makeRecording({
            trends: { spectrogram: { epochLength: 3, epochStep: 0.5 } },
        })
        internals._signalCacheStatus = [0, 10.2]
        internals._trendsEnabled.add('spectrogram')
        internals._buildSpectrogramTrends()
        // The last window that fits in 10.2 s starts at 7 and ends at 10.
        expect(compute).toHaveBeenCalledWith([0, 10])
        compute.mockRestore()
    })
})
