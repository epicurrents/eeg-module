/**
 * Unit tests for EegService: what the setup commission carries to the worker. The signal file and the
 * app-settings snapshot both have to be right for the worker to compute a cache layout that fits the
 * buffer the main thread allocated, and a mismatch shows up as corrupt signal rather than as an error.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BiosignalHeaderRecord, StudyContext } from '@epicurrents/core/types'
import EegService from '../src/service/EegService'

const APP_SETTINGS = {
    dataBlockDuration: 1800,
    dataChunkSize: 1048576,
    logThreshold: 'DEBUG',
    maxDirectLoadSize: 10485760,
    maxLoadCacheSize: 104857600,
    signalLoadingYieldMs: 5,
    useMemoryManager: true,
}

const header = { serializable: { signalCount: 1 } } as unknown as BiosignalHeaderRecord

const makeService = () => {
    const worker = { addEventListener: vi.fn() } as unknown as Worker
    const service = new EegService({} as never, worker, undefined)
    const commission = vi.spyOn(service as unknown as {
        _commissionWorker: (name: string, params: Map<string, unknown>) => { promise: Promise<unknown> }
    }, '_commissionWorker').mockReturnValue({ promise: Promise.resolve(42) })
    return { service, worker, commission }
}

/** The parameter map of the single commission the service posted. */
const params = (commission: ReturnType<typeof makeService>['commission']) =>
    commission.mock.calls[0][1] as Map<string, unknown>

const studyWith = (...files: Record<string, unknown>[]) => ({ files } as unknown as StudyContext)

describe('EegService.setupWorker', () => {
    beforeEach(() => {
        ;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = {
            RUNTIME: { SETTINGS: { app: APP_SETTINGS } },
        }
    })

    test('commissions setup-worker and returns what the worker answered', async () => {
        const { service, commission } = makeService()
        expect(await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }))).toBe(42)
        expect(commission.mock.calls[0][0]).toBe('setup-worker')
    })

    test('picks the EEG data file rather than the first file of the study', async () => {
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith(
            { modality: 'meta', role: 'data', url: 'sidecar' },
            { modality: 'eeg', role: 'meta', url: 'notdata' },
            { modality: 'eeg', role: 'data', url: 'signal' },
        ))
        expect(params(commission).get('url')).toBe('signal')
    })

    test('hands the File over alongside its object URL when the study carries one', async () => {
        // The URL is a blob reference to the same bytes, so reading part ranges back through the fetch
        // stack would copy every one of them for nothing.
        const { service, commission } = makeService()
        const file = new File(['x'], 'rec.edf')
        await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'blob:x', file }))
        expect(params(commission).get('file')).toBe(file)
    })

    test('carries every data file, so a recording spanning several is openable', async () => {
        // No one member of such a study is the recording, so a reader that needs the set has to be
        // given it; a single-file reader ignores it.
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith(
            { modality: 'eeg', role: 'data', url: 'a', name: 'a' },
            { modality: 'eeg', role: 'data', url: 'b', name: 'b' },
        ))
        expect((params(commission).get('files') as { name: string }[]).map(f => f.name)).toEqual(['a', 'b'])
    })

    test('snapshots the main thread cache settings the worker computes its layout from', async () => {
        // The worker decides its rolling-cache layout from these; defaulting to the bundled values
        // instead would size a layout that does not fit the allocated buffer.
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }))
        expect(params(commission).get('settingsApp')).toEqual(APP_SETTINGS)
    })

    test('sends a null snapshot rather than a partial one when there is no runtime', async () => {
        ;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = undefined
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }))
        expect(params(commission).get('settingsApp')).toBeNull()
    })

    test('passes the authorization header through when one is given, and null when not', async () => {
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }),
                                  { authHeader: 'Bearer t' })
        expect(params(commission).get('authHeader')).toBe('Bearer t')
        const plain = makeService()
        await plain.service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }))
        expect(params(plain.commission).get('authHeader')).toBeNull()
    })

    test('sends the serializable header rather than the record object', async () => {
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }))
        expect(params(commission).get('header')).toBe(header.serializable)
    })

    test('a study with no EEG data file commissions with no url and no file', async () => {
        const { service, commission } = makeService()
        await service.setupWorker(header, studyWith({ modality: 'video', role: 'data', url: 'v' }))
        expect(params(commission).get('url')).toBeUndefined()
        expect(params(commission).get('file')).toBeNull()
    })

    test('a throw while commissioning answers zero rather than escaping', async () => {
        // The caller reads a falsy answer as a failed setup and moves the recording into its error
        // state; a throw here would leave it in no state at all.
        const { service, commission } = makeService()
        commission.mockImplementation(() => { throw new Error('no worker') })
        expect(await service.setupWorker(header, studyWith({ modality: 'eeg', role: 'data', url: 'u' }))).toBe(0)
    })
})

describe('EegService message handling', () => {
    test('a message with no data is not handled', async () => {
        const { service } = makeService()
        expect(await service.handleMessage({} as never)).toBe(false)
    })

    test('a message with data reaches the base handler', async () => {
        const { service } = makeService()
        expect(await service.handleMessage({ data: { action: 'x' } } as never)).toBe(true)
    })

    test('a rejection from the handler is logged rather than left unhandled', async () => {
        // The listener slot is synchronous, so the rejection has to be caught and reported here;
        // discarded with a `void`, a malformed worker message would surface nowhere at all.
        const { service, worker } = makeService()
        const listener = (worker.addEventListener as unknown as {
            mock: { calls: [string, (event: MessageEvent) => void][] }
        }).mock.calls[0][1]
        const failure = new Error('bad message')
        vi.spyOn(service, 'handleMessage').mockRejectedValue(failure)
        const { Log } = await import('scoped-event-log')
        const logSpy = vi.spyOn(Log, 'error').mockImplementation(() => undefined as never)
        expect(() => listener({ data: {} } as MessageEvent)).not.toThrow()
        await Promise.resolve()
        await Promise.resolve()
        expect(logSpy).toHaveBeenCalled()
        expect(logSpy.mock.calls[0][2]).toBe(failure)
        logSpy.mockRestore()
    })
})
