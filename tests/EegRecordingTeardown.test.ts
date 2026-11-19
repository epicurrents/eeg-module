/**
 * Unit tests for the recording's own trend worker. Nothing outside the recording terminates it, so a service that is
 * dropped rather than destroyed leaves a thread running for the life of the page.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test, vi } from 'vitest'
import type { BiosignalChannel } from '@epicurrents/core/types'
import { Log } from 'scoped-event-log'

const services: { destroy: ReturnType<typeof vi.fn>, setupWorker: ReturnType<typeof vi.fn> }[] = []
let setupResult = true

vi.mock('@epicurrents/core/assets', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    TrendService: vi.fn().mockImplementation(function () {
        const service = {
            destroy: vi.fn().mockResolvedValue(undefined),
            setupWorker: vi.fn(async () => setupResult),
        }
        services.push(service)
        return service
    }),
}))

import EegRecording from '../src/EegRecording'

;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = {
    RUNTIME: { SETTINGS: { modules: { eeg: {} }, app: {} } },
}

const CHANNELS = [
    { name: 'C3', label: 'C3', modality: 'eeg', averaged: false, samplingRate: 256, unit: 'uV',
      visible: true, sampleCount: 2560 },
] as unknown as BiosignalChannel[]

type Internals = {
    _initTrendService: () => Promise<void>
    _trends: Map<string, unknown>
    _trendService: unknown
    _trendServiceUnavailable: string | null
}

const makeRecording = () => {
    const rec = new EegRecording(
        'r',
        CHANNELS,
        { recordingStartTime: 0, dataUnitCount: 10, dataUnitDuration: 1 } as never,
        { addEventListener: () => undefined } as never,
    )
    // A cache backed by shared memory, which is what lets the trend service be set up at all.
    Object.defineProperty(rec, 'dataCache', { value: { buffer: new ArrayBuffer(8) } })
    return { rec, internals: rec as unknown as Internals }
}

describe('the trend worker', () => {
    test('is shut down when the recording is set up again', async () => {
        services.length = 0
        setupResult = true
        const { rec, internals } = makeRecording()
        await internals._initTrendService()
        // A trend built on the first service would compute through a terminated worker if it outlived it.
        const trend = { cancelTrendComputation: vi.fn(), name: 'aeeg-left' }
        internals._trends.set(trend.name, trend)
        await internals._initTrendService()
        expect(services).toHaveLength(2)
        expect(trend.cancelTrendComputation).toHaveBeenCalled()
        expect(rec.getTrend('aeeg-left')).toBeNull()
        expect(services[0].destroy).toHaveBeenCalledTimes(1)
        expect(services[1].destroy).not.toHaveBeenCalled()
        expect(internals._trendService).toBe(services[1])
    })

    test('is shut down when its setup fails', async () => {
        services.length = 0
        setupResult = false
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const { internals } = makeRecording()
        await internals._initTrendService()
        expect(services[0].destroy).toHaveBeenCalledTimes(1)
        expect(internals._trendService).toBeNull()
        expect(internals._trendServiceUnavailable).toBe('the trend worker could not be set up')
        warn.mockRestore()
    })

    test('is shut down when the recording is destroyed', async () => {
        services.length = 0
        setupResult = true
        const { rec, internals } = makeRecording()
        await internals._initTrendService()
        await rec.destroy()
        expect(services[0].destroy).toHaveBeenCalledTimes(1)
        expect(internals._trendService).toBeNull()
    })

    test('does not hold the rest of the teardown when it refuses to shut down', async () => {
        services.length = 0
        setupResult = true
        const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined)
        const { rec, internals } = makeRecording()
        await internals._initTrendService()
        services[0].destroy.mockRejectedValueOnce(new Error('refused'))
        const trend = { cancelTrendComputation: vi.fn(), name: 'aeeg-left' }
        internals._trends.set(trend.name, trend)
        await expect(rec.destroy()).resolves.toBeUndefined()
        expect(trend.cancelTrendComputation).toHaveBeenCalled()
        expect(internals._trendService).toBeNull()
        warn.mockRestore()
    })
})
