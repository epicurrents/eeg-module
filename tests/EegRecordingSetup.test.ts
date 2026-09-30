/**
 * Unit tests for the memory budget `_completeSetup` requests, and for the setup path's failure
 * handling. The block duration derived here is computed a second time inside the reader worker and a
 * third time by the study loader, and all three have to agree: a layout computed against a different
 * block size does not fit the buffer that was allocated, which corrupts signal rather than erroring.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test, vi } from 'vitest'
import type { BiosignalChannel } from '@epicurrents/core/types'
import EegRecording from '../src/EegRecording'

const MB = 1024*1024
/** Lock cell plus the five mutex meta fields, as the budget counts them. */
const MUTEX_OVERHEAD = 6
/** Per-channel mutex header length, from `BiosignalMutex.SIGNAL_DATA_POS`. */
const DATA_FIELDS = 4

const setRuntime = (maxLoadCacheSize: number, dataBlockDuration = 3600) => {
    ;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = {
        RUNTIME: { SETTINGS: { modules: { eeg: {} }, app: { maxLoadCacheSize, dataBlockDuration } } },
    }
}

const channelsOf = (count: number, seconds: number, samplingRate = 256) =>
    Array.from({ length: count }, (_, i) => ({
        name: `C${i}`, label: `C${i}`, modality: 'eeg', averaged: false, samplingRate,
        unit: 'uV', visible: true, sampleCount: seconds*samplingRate,
    })) as unknown as BiosignalChannel[]

/**
 * A prepared, inactive recording whose setup is ready to run under a memory manager, with the
 * allocation request captured rather than served.
 */
const preparedRecording = (channels: BiosignalChannel[]) => {
    const rec = new EegRecording(
        'r', channels,
        { recordingStartTime: 0, dataUnitCount: 100, dataUnitDuration: 1 } as never,
        { addEventListener: () => undefined } as never,
    )
    const requestMemory = vi.fn().mockResolvedValue(true)
    const internals = rec as unknown as Record<string, unknown>
    internals._SETTINGS = { events: { ignorePatterns: [], convertPatterns: [] }, skipDefaultSetups: true }
    internals._state = 'ready'
    internals._memoryManager = {}
    internals._service = { isReady: false, requestMemory, onPropertyChange: () => undefined }
    internals._mutexProps = { sentinel: true }
    ;(EegRecording as unknown as { EVENTS: unknown }).EVENTS =
        (EegRecording as unknown as { EVENTS?: unknown }).EVENTS ?? { INITIAL_SETUP: 'initial-setup' }
    vi.spyOn(rec as unknown as { _initTrendService: () => Promise<void> }, '_initTrendService')
        .mockResolvedValue(undefined)
    vi.spyOn(rec as unknown as { _wireMontageDataSources: () => Promise<void> }, '_wireMontageDataSources')
        .mockResolvedValue(undefined)
    return { rec, requestMemory, internals }
}

/** Run the setup and return the float count it asked the memory manager for. */
const requestedFloats = async (channels: BiosignalChannel[]) => {
    const { rec, requestMemory } = preparedRecording(channels)
    await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
    return requestMemory.mock.calls[0]?.[0] as number
}

describe('memory budget', () => {
    test('a recording that fits whole is allocated its full sample count', async () => {
        // 2 channels × 100 s × 256 Hz = 51 200 floats, well inside the budget.
        setRuntime(100*MB)
        expect(await requestedFloats(channelsOf(2, 100)))
            .toBe(MUTEX_OVERHEAD + 2*(100*256 + DATA_FIELDS))
    })

    test('a recording too large for the budget is allocated three blocks per channel', async () => {
        // 4 channels × 8 h × 256 Hz is 118 MB of floats against a 16 MiB budget, so the rolling path
        // applies and the block is whatever fits three of into 95 % of the budget.
        setRuntime(16*MB)
        const channels = channelsOf(4, 8*3600)
        const bytesPerSecond = 4*256*4
        const blockDuration = Math.max(60, Math.min(3600, Math.floor(16*MB*0.95/(3*bytesPerSecond))))
        expect(await requestedFloats(channels))
            .toBe(MUTEX_OVERHEAD + 4*(Math.ceil(3*blockDuration*256) + DATA_FIELDS))
    })

    test('the block duration stops growing at the configured cap', async () => {
        // 2 channels × 24 h × 256 Hz is 177 MB of floats, past a 64 MiB budget, so the rolling path
        // applies; three blocks of the ideal size would fit but the cap is what the worker also
        // applies, and a block computed past it would not match the layout the worker builds.
        setRuntime(64*MB, 600)
        const channels = channelsOf(2, 24*3600)
        expect(await requestedFloats(channels))
            .toBe(MUTEX_OVERHEAD + 2*(Math.ceil(3*600*256) + DATA_FIELDS))
    })

    test('the block duration has a floor, so a small budget still gets a workable block', async () => {
        // The floor deliberately overruns a tiny budget rather than allocating a block too short to
        // render a page from; the study loader is what refuses such a recording up front.
        setRuntime(1*MB)
        const channels = channelsOf(32, 24*3600)
        expect(await requestedFloats(channels))
            .toBe(MUTEX_OVERHEAD + 32*(Math.ceil(3*60*256) + DATA_FIELDS))
    })

    test('a channel shorter than three blocks is allocated only what it has', async () => {
        // Rolling or not, no channel needs more slots than it has samples.
        setRuntime(1*MB)
        const channels = [...channelsOf(1, 24*3600), ...channelsOf(1, 30)]
        const blockDuration = Math.max(60, Math.min(3600, Math.floor(1*MB*0.95/(3*2*256*4))))
        const floats = await requestedFloats(channels)
        expect(floats).toBe(
            MUTEX_OVERHEAD + (Math.ceil(3*blockDuration*256) + DATA_FIELDS) + (30*256 + DATA_FIELDS)
        )
    })

    test('a derivation slot is budgeted exactly like a source channel', async () => {
        // The slots are declared by the setup and cached in the same buffer, so leaving them out
        // allocates a buffer the worker then overruns.
        setRuntime(100*MB)
        const { rec, requestMemory, internals } = preparedRecording(channelsOf(1, 100))
        internals._derivationCacheSlots = () => [{ sampleCount: 100*256, samplingRate: 256 }]
        await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
        expect(requestMemory.mock.calls[0][0]).toBe(MUTEX_OVERHEAD + 2*(100*256 + DATA_FIELDS))
    })

    test('an annotation channel carrying no samples adds only its header', async () => {
        setRuntime(100*MB)
        const channels = [...channelsOf(1, 100), ...channelsOf(1, 0, 0)]
        expect(await requestedFloats(channels)).toBe(MUTEX_OVERHEAD + (100*256 + DATA_FIELDS) + DATA_FIELDS)
    })
})

describe('the budget as a property rather than a formula', () => {
    // The cases above restate the implementation's own arithmetic, which detects a change to it but
    // cannot say the arithmetic is right. These assert what the budget is *for*: the allocation has to
    // fit the cache it was sized against.
    const fitsBudget = async (channels: BiosignalChannel[], cacheMiB: number, blockCap = 3600) => {
        setRuntime(cacheMiB*MB, blockCap)
        return (await requestedFloats(channels))*4 <= cacheMiB*MB
    }

    test('a recording that fits whole is allocated within the budget', async () => {
        expect(await fitsBudget(channelsOf(2, 100), 100)).toBe(true)
    })

    test('a rolling allocation stays within the budget across a wide range of recordings', async () => {
        // Channel counts and durations either side of every branch: the rolling threshold, the block
        // cap and the floor.
        for (const [count, seconds, cacheMiB] of [
            [4, 8*3600, 16], [32, 24*3600, 64], [19, 3600, 8], [2, 24*3600, 64], [64, 12*3600, 256],
        ] as [number, number, number][]) {
            expect(await fitsBudget(channelsOf(count, seconds), cacheMiB),
                   `${count} channels, ${seconds}s, ${cacheMiB} MiB`).toBe(true)
        }
    })

    test('the floor deliberately overruns a budget too small for it', async () => {
        // The one case where the budget is knowingly exceeded: a block shorter than 60 s is too short
        // to render a page from, so the allocation asks for more than the cache holds and the study
        // loader is what refuses such a recording up front. Asserting it rather than leaving it
        // implicit keeps the overrun a decision rather than a bug nobody noticed.
        expect(await fitsBudget(channelsOf(32, 24*3600), 1)).toBe(false)
    })

    test('a wider cache never asks for less than a narrower one', async () => {
        // Monotonic in the budget: the block grows with the cache until the cap, so a deployment that
        // raises the setting cannot end up with a smaller working set.
        const channels = channelsOf(8, 12*3600)
        const asked: number[] = []
        for (const cacheMiB of [8, 16, 64, 256, 1024]) {
            setRuntime(cacheMiB*MB)
            asked.push(await requestedFloats(channels))
        }
        for (let i = 1; i < asked.length; i++) {
            expect(asked[i], `${asked[i]} after ${asked[i - 1]}`).toBeGreaterThanOrEqual(asked[i - 1])
        }
    })

    test('no channel is ever allocated more slots than it has samples', async () => {
        // True on both paths, and the only bound that keeps a short channel in a long recording from
        // being given three blocks it cannot fill.
        setRuntime(4096*MB)
        const channels = channelsOf(4, 600)
        const floats = await requestedFloats(channels)
        expect(floats).toBeLessThanOrEqual(MUTEX_OVERHEAD + 4*(600*256 + DATA_FIELDS))
    })
})

describe('setup failure handling', () => {
    test('a refused allocation puts the recording in an error state with a reason', async () => {
        setRuntime(100*MB)
        const { rec, requestMemory } = preparedRecording(channelsOf(1, 100))
        requestMemory.mockResolvedValue(false)
        await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
        expect(rec.state).toBe('error')
        expect(rec.errorReason).toBe('Memory allocation failed')
    })

    test('a failed allocation on an inactive recording does not deactivate it', async () => {
        // A preload that fails is already inactive, and assigning false again dispatches DEACTIVATE
        // and begins unloading a resource that was never up.
        setRuntime(100*MB)
        const { rec, requestMemory, internals } = preparedRecording(channelsOf(1, 100))
        requestMemory.mockResolvedValue(false)
        internals._isActive = false
        const dispatch = vi.spyOn(rec, 'dispatchEvent')
        await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
        expect(dispatch).not.toHaveBeenCalledWith('deactivate', expect.anything())
    })

    test('a failed allocation on an active recording does deactivate it', async () => {
        // The other half of the same rule: a recording the user opened must not be left active with
        // a buffer it never got.
        setRuntime(100*MB)
        const { rec, requestMemory, internals } = preparedRecording(channelsOf(1, 100))
        requestMemory.mockResolvedValue(false)
        internals._isActive = true
        const dispatch = vi.spyOn(rec, 'dispatchEvent')
        await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
        expect(dispatch).toHaveBeenCalledWith('deactivate', expect.anything())
        expect(rec.isActive).toBe(false)
    })

    test('setup does not run again once the service is ready', async () => {
        // Activation calls this on every ACTIVATE and preload may reach it as well, so a second pass
        // has to find the work done rather than reallocating the buffer under a live cache.
        setRuntime(100*MB)
        const { rec, requestMemory, internals } = preparedRecording(channelsOf(1, 100))
        ;(internals._service as { isReady: boolean }).isReady = true
        await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
        expect(requestMemory).not.toHaveBeenCalled()
    })

    test('setup does not run on a recording that is not prepared', async () => {
        setRuntime(100*MB)
        const { rec, requestMemory, internals } = preparedRecording(channelsOf(1, 100))
        internals._state = 'added'
        await (rec as unknown as { _completeSetup: () => Promise<void> })._completeSetup()
        expect(requestMemory).not.toHaveBeenCalled()
    })

    test('preload refuses a recording that has not been prepared', async () => {
        setRuntime(100*MB)
        const { rec, internals } = preparedRecording(channelsOf(1, 100))
        internals._state = 'added'
        expect(await rec.preload()).toBe(false)
    })

    test('preload reports the failure that setup recorded rather than its own guard', async () => {
        // The guard narrows on the state it read before setup ran, so the result has to be read back
        // off the resource or a failed allocation would report success.
        setRuntime(100*MB)
        const { rec, requestMemory } = preparedRecording(channelsOf(1, 100))
        requestMemory.mockResolvedValue(false)
        expect(await rec.preload()).toBe(false)
        expect(rec.state).toBe('error')
    })

    test('preload succeeds on a recording whose setup completes', async () => {
        setRuntime(100*MB)
        const { rec } = preparedRecording(channelsOf(1, 100))
        expect(await rec.preload()).toBe(true)
    })

    test('the preloading flag is cleared even when setup throws', async () => {
        // Left set, it would tell every later check that an ordinary activation is a background
        // preparation, and the announce on a caching failure would never reach the user.
        setRuntime(100*MB)
        const { rec, internals } = preparedRecording(channelsOf(1, 100))
        vi.spyOn(rec as unknown as { _completeSetup: () => Promise<void> }, '_completeSetup')
            .mockRejectedValue(new Error('boom'))
        await expect(rec.preload()).rejects.toThrow('boom')
        expect(internals._isPreloading).toBe(false)
    })
})
