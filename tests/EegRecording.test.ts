/**
 * Unit tests for EegRecording.
 * @package    @epicurrents/eeg-module
 */

import EegRecording from '../src/EegRecording'

// `window.__EPICURRENTS__.RUNTIME.SETTINGS.modules.eeg` is read in EegRecording's
// constructor. The cache-lifecycle tests below need `_SETTINGS.unloadOnClose` to
// be controllable, so seed the global before any EegRecording is instantiated.
;(window as any).__EPICURRENTS__ = {
    RUNTIME: {
        SETTINGS: {
            modules: {
                eeg: {
                    unloadOnClose: false,
                    useMemoryManager: false,
                    events: { ignorePatterns: [], convertPatterns: [] },
                    skipDefaultSetups: true,
                    defaultSetups: [],
                    defaultMontages: {},
                },
            },
            app: {
                dataChunkSize: 1048576,
                maxLoadCacheSize: 104857600,
            },
        },
    },
}

describe('EegRecording', () => {
    test('addSetup returns created setup and duplicate call returns existing (or errors if bug present)', () => {
        const header: any = { recordingStartTime: 0, dataUnitCount: 10, dataUnitDuration: 1 }
        const channels: any[] = [{ name: 'C3', label: 'C3', modality: 'eeg', averaged: false, samplingRate: 256, unit: 'uV', visible: true, sampleCount: 100 }]
        // fake worker
        const worker: any = { addEventListener: () => {} }
        const rec = new EegRecording('r', channels, header, worker)
        const setupConfig: any = { name: 's1' }
        const s1 = rec.addSetup(setupConfig, channels)
        expect(s1).not.toBeNull()
        // second call should return the existing setup
        const s2 = rec.addSetup(setupConfig, channels)
        expect(s2).toBe(s1)
    })

    // Cross-activation race regression tests. Three invariants documented in
    // CLAUDE.md (sections "SAB cache lifecycle" and "synchronous _isActive flip"
    // companion fix) must hold to prevent the resource-switch error cascade
    // ("signal cache has not been set up yet") and the reactivation-stuck
    // ("Loading signal data" placeholder) bugs from returning.
    describe('Cache lifecycle race regressions', () => {
        const makeHeader = () => ({
            recordingStartTime: 0,
            dataUnitCount: 10,
            dataUnitDuration: 1,
        } as any)
        const makeChannels = () => [{
            name: 'C3', label: 'C3', modality: 'eeg', averaged: false,
            samplingRate: 256, unit: 'uV', visible: true, sampleCount: 100,
        }] as any[]
        const makeWorker = () => ({ addEventListener: () => {} } as any)

        describe('isActive setter — synchronous _isActive flip when unloadOnClose=true', () => {
            it('flips isActive to false synchronously, before unload() resolves', () => {
                const rec = new EegRecording('r', makeChannels(), makeHeader(), makeWorker())
                // Set the conditions that route through the EegRecording-specific
                // setter branch (not super.isActive). Both must be true:
                ;(rec as any)._SETTINGS = { unloadOnClose: true }
                ;(rec as any)._service = { isReady: true }
                ;(rec as any)._isActive = true

                // unload returns a never-resolving promise so we can prove the
                // flag flip happens *before* the unload completes (the original
                // bug parked the assignment inside .then()).
                let unloadCallCount = 0
                let resolveUnload!: () => void
                const unloadPromise = new Promise<void>((resolve) => { resolveUnload = resolve })
                ;(rec as any).unload = () => {
                    unloadCallCount++
                    return unloadPromise
                }

                rec.isActive = false

                // Synchronous read right after the assignment statement. If the
                // setter ever reverts to the async pattern this assertion fails
                // — there is no microtask between the assignment and this read.
                expect(rec.isActive).toBe(false)
                expect(unloadCallCount).toBe(1)

                // Cleanup so the dangling promise doesn't leak between tests.
                resolveUnload()
            })

            it('handler-thrown unload rejection does not throw out of the setter', async () => {
                const rec = new EegRecording('r', makeChannels(), makeHeader(), makeWorker())
                ;(rec as any)._SETTINGS = { unloadOnClose: true }
                ;(rec as any)._service = { isReady: true }
                ;(rec as any)._isActive = true
                ;(rec as any).unload = () => Promise.reject(new Error('boom'))

                // The setter swallows the rejection via `.catch(...)`. If
                // someone removes that catch the promise becomes an
                // unhandled-rejection and node/vitest will surface a warning;
                // the assignment itself still must not throw.
                expect(() => { rec.isActive = false }).not.toThrow()
                expect(rec.isActive).toBe(false)
                // Allow the rejected promise's handler to run before we exit.
                await Promise.resolve()
                await Promise.resolve()
            })
        })

        describe('addMontage — cache setup awaited before montages property change', () => {
            it('does not dispatch the montages property change until setupServiceWithInputMutex resolves', async () => {
                const rec = new EegRecording('r', makeChannels(), makeHeader(), makeWorker())
                // Bypass the "buffer initialized" guard so we don't have to
                // wire up a full mutex.
                ;(rec as any)._service = { bufferRangeStart: 0 }
                ;(rec as any)._mutexProps = { /* truthy sentinel */ }

                // Replace the EegMontage constructor with a controllable
                // surrogate. addMontage looks up the constructor by name in
                // module scope via `new EegMontage(...)`; we shim the prototype
                // method of the actual class instead, which addMontage will
                // call once the new instance is created.
                let resolveSetup!: () => void
                const setupPromise = new Promise<void>((resolve) => { resolveSetup = resolve })
                const { EegMontage } = await import('../src/components')
                const setupSpy = vi.spyOn(EegMontage.prototype as any, 'setupServiceWithInputMutex')
                    .mockImplementation(() => setupPromise as any)
                vi.spyOn(EegMontage.prototype as any, 'mapChannels').mockImplementation(() => {})
                vi.spyOn(EegMontage.prototype as any, 'setInterruptions').mockImplementation(() => {})

                // Spy on the property-change dispatch so we can prove ordering.
                const propSpy = vi.spyOn(rec as any, '_setPropertyValue')

                // Provide the minimum config addMontage needs.
                ;(rec as any)._setups = [{ name: 'setup1', channels: [] }]
                const addPromise = rec.addMontage('mtg1', 'Montage 1', 'setup1' as any, {} as any)

                // Yield a few microtasks. setup is still pending, so the
                // property change must NOT have fired yet.
                await Promise.resolve()
                await Promise.resolve()
                expect(setupSpy).toHaveBeenCalled()
                expect(propSpy).not.toHaveBeenCalledWith('montages', expect.anything())

                // Resolve the setup commission — the property change should
                // now fire when addMontage awaits past the setup.
                resolveSetup()
                await addPromise
                expect(propSpy).toHaveBeenCalledWith('montages', expect.any(Array))
            })

            it('falls back to setupServiceWithCache and still awaits before publishing', async () => {
                const rec = new EegRecording('r', makeChannels(), makeHeader(), makeWorker())
                // No mutex props, so the cache branch runs instead.
                ;(rec as any)._service = { bufferRangeStart: -1 }
                ;(rec as any)._mutexProps = null
                ;(rec as any)._cacheProps = { /* truthy */ }

                let resolveSetup!: () => void
                const setupPromise = new Promise<void>((resolve) => { resolveSetup = resolve })
                const { EegMontage } = await import('../src/components')
                const setupSpy = vi.spyOn(EegMontage.prototype as any, 'setupServiceWithCache')
                    .mockImplementation(() => setupPromise as any)
                vi.spyOn(EegMontage.prototype as any, 'mapChannels').mockImplementation(() => {})
                vi.spyOn(EegMontage.prototype as any, 'setInterruptions').mockImplementation(() => {})

                const propSpy = vi.spyOn(rec as any, '_setPropertyValue')
                ;(rec as any)._setups = [{ name: 'setup1', channels: [] }]
                const addPromise = rec.addMontage('mtg2', 'Montage 2', 'setup1' as any, {} as any)

                await Promise.resolve()
                await Promise.resolve()
                expect(setupSpy).toHaveBeenCalled()
                expect(propSpy).not.toHaveBeenCalledWith('montages', expect.anything())

                resolveSetup()
                await addPromise
                expect(propSpy).toHaveBeenCalledWith('montages', expect.any(Array))
            })
        })

        describe('ACTIVATE handler — guards against re-running setup in the before phase', () => {
            it('exits early without invoking the setup body when _isActive is false', async () => {
                // Capture the ACTIVATE handler registered in the constructor by
                // shimming addEventListener BEFORE constructing the recording.
                const captured: Record<string, Function> = {}
                const { GenericBiosignalResource } = await import('@epicurrents/core' as any)
                const addSpy = vi.spyOn(GenericBiosignalResource.prototype, 'addEventListener')
                    .mockImplementation(function (this: any, ev: any, cb: any) {
                        if (typeof ev === 'string') {
                            captured[ev] = cb
                        }
                    })

                const rec = new EegRecording('r', makeChannels(), makeHeader(), makeWorker())
                addSpy.mockRestore()

                // The handler must have been registered for the 'activate' event.
                const activateCb = captured['activate']
                expect(typeof activateCb).toBe('function')

                // Spy on the first thing the setup body does after the guard —
                // dispatching INITIAL_SETUP. If the guard exits early, no
                // dispatch happens; if the guard is removed, the dispatch
                // fires for the 'before' phase too.
                const dispatchSpy = vi.spyOn(rec as any, 'dispatchEvent')

                // Phase = 'before': _isActive is still false. Handler must return.
                ;(rec as any)._isActive = false
                await activateCb!.call(rec)
                expect(dispatchSpy).not.toHaveBeenCalled()

                // Phase = 'after': _isActive is now true, and the inner setup
                // branch requires `!service.isReady && state === 'ready'`. The
                // first thing the body does past that branch is dispatch the
                // INITIAL_SETUP event — proving the handler crossed the guard.
                ;(rec as any)._isActive = true
                ;(rec as any)._service = { isReady: false }
                ;(rec as any)._state = 'ready'
                // The full setup chain would try to allocate memory and call
                // setupMutex; we don't need either of those to run for the
                // invariant check, so let them no-op / throw and just observe
                // that dispatchEvent fired before that point.
                ;(rec as any)._memoryManager = null
                // EegRecording.EVENTS is inherited from GenericResource.EVENTS
                // in the real core, but the mock parent omits it. Stub the
                // minimum the handler reads so the dispatch site doesn't NPE
                // before we observe the spy.
                ;(EegRecording as any).EVENTS = (EegRecording as any).EVENTS ?? { INITIAL_SETUP: 'initial-setup' }
                await activateCb!.call(rec).catch(() => { /* swallow any downstream errors */ })
                expect(dispatchSpy).toHaveBeenCalled()
            })
        })
    })
})
