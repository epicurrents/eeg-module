/**
 * Unit tests for how the recording publishes the montages it creates. Every change of `montages` is a synchronous
 * dispatch that a viewer answers by re-rendering, so the default montages are published together, and each is
 * commissioned before it is published, since a listener may ask it for signals inside the dispatch.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { afterEach, describe, expect, test, vi } from 'vitest'
import type { BiosignalChannel } from '@epicurrents/core/types'
import EegRecording from '../src/EegRecording'
import EegMontage from '../src/components/EegMontage'

;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = {
    RUNTIME: { SETTINGS: { modules: { eeg: {} }, app: {} } },
}

const CHANNELS = [
    { name: 'C3', label: 'C3', modality: 'eeg', averaged: false, samplingRate: 256, unit: 'uV',
      visible: true, sampleCount: 2560 },
] as unknown as BiosignalChannel[]

const SETUP = 'default:10-20'

/** A recording with the default 10-20 setup in place and a mutex to commission montages against. */
const makeRecording = () => {
    const rec = new EegRecording(
        'r',
        CHANNELS,
        { recordingStartTime: 0, dataUnitCount: 10, dataUnitDuration: 1 } as never,
        { addEventListener: () => undefined } as never,
    )
    const internals = rec as unknown as Record<string, unknown>
    internals._SETTINGS = {
        events: { ignorePatterns: [], convertPatterns: [] },
        defaultSetups: [SETUP],
        defaultMontages: { [SETUP]: [['rec', 'As recorded'], ['avg', 'Average']] },
    }
    internals._setups = [{ name: SETUP, channels: [] }]
    internals._mutexProps = { sentinel: true }
    // A service with a buffer range assigned, which is what lets montages be commissioned against the mutex.
    internals._service = { bufferRangeStart: 0 }
    const log: string[] = []
    type Publishing = { _setPropertyValue: (p: string, v: unknown) => void }
    const publish = vi.spyOn(rec as unknown as Publishing, '_setPropertyValue')
    publish.mockImplementation(function (this: Record<string, unknown>, prop: string, value: unknown) {
        if (prop === 'montages') {
            log.push(`publish ${(value as EegMontage[]).map(m => m.name).join(', ')}`)
        }
        this[prop] = value
    })
    return { rec, internals, log, publish }
}

describe('publishing montages', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('publishes the default montages once, each commissioned before it', async () => {
        vi.spyOn(EegMontage.prototype, 'mapChannels').mockImplementation(() => [])
        const { rec, internals, log } = makeRecording()
        const commission = async function (this: EegMontage) {
            log.push(`commission ${this.name}`)
            return { success: true } as never
        }
        vi.spyOn(EegMontage.prototype, 'setupServiceWithInputMutex').mockImplementation(commission)
        await (rec as unknown as { _applyDefaultMontages: () => Promise<void> })._applyDefaultMontages()
        const publishes = log.filter(entry => entry.startsWith('publish'))
        expect(publishes).toHaveLength(1)
        // Every montage the publication carries was commissioned before it.
        const published = publishes[0].replace('publish ', '').split(', ')
        expect(published).toEqual(expect.arrayContaining([`${SETUP}:rec`, `${SETUP}:avg`]))
        for (const name of published) {
            expect(log.indexOf(`commission ${name}`)).toBeLessThan(log.indexOf(publishes[0]))
        }
        expect(rec.montages.map(m => m.name)).toEqual(published)
        expect((internals._recordMontage as EegMontage | null)?.name).toBe(`${SETUP}:rec`)
    })

    test('publishes the other default montages when one cannot be commissioned', async () => {
        vi.spyOn(EegMontage.prototype, 'mapChannels').mockImplementation(() => [])
        const destroyed: string[] = []
        vi.spyOn(EegMontage.prototype, 'destroy').mockImplementation(async function (this: EegMontage) {
            destroyed.push(this.name)
        })
        const { rec } = makeRecording()
        vi.spyOn(EegMontage.prototype, 'setupServiceWithInputMutex').mockImplementation(
            async function (this: EegMontage) {
                if (this.name === `${SETUP}:rec`) {
                    throw new Error('refused')
                }
                return { success: true } as never
            }
        )
        await (rec as unknown as { _applyDefaultMontages: () => Promise<void> })._applyDefaultMontages()
        expect(rec.montages.map(m => m.name)).toContain(`${SETUP}:avg`)
        expect(rec.montages.map(m => m.name)).not.toContain(`${SETUP}:rec`)
        // Nothing else holds the montage that failed, so its service is shut down where it was made.
        expect(destroyed).toEqual([`${SETUP}:rec`])
    })

    test('publishes the montages made before one that throws', async () => {
        vi.spyOn(EegMontage.prototype, 'mapChannels').mockImplementation(() => [])
        vi.spyOn(EegMontage.prototype, 'setupServiceWithInputMutex').mockResolvedValue({ success: true } as never)
        const { rec } = makeRecording()
        type Preparing = { _prepareMontage: (...args: unknown[]) => Promise<EegMontage | null> }
        const prepare = (rec as unknown as Preparing)._prepareMontage.bind(rec)
        vi.spyOn(rec as unknown as Preparing, '_prepareMontage').mockImplementation(async (...args: unknown[]) => {
            if (args[0] === `${SETUP}:avg`) {
                throw new Error('failed')
            }
            return prepare(...args)
        })
        const apply = (rec as unknown as { _applyDefaultMontages: () => Promise<void> })._applyDefaultMontages()
        await expect(apply).rejects.toThrow('failed')
        expect(rec.montages.map(m => m.name)).toEqual([`${SETUP}:rec`])
    })

    test('adds a montage that exists already without publishing it again', async () => {
        vi.spyOn(EegMontage.prototype, 'mapChannels').mockImplementation(() => [])
        const { rec, log } = makeRecording()
        const first = await rec.addMontage(`${SETUP}:rec`, 'As recorded', SETUP)
        const again = await rec.addMontage(`${SETUP}:rec`, 'As recorded', SETUP)
        expect(first).not.toBeNull()
        expect(again).toBe(first)
        expect(log.filter(entry => entry.startsWith('publish'))).toHaveLength(1)
        expect(rec.montages).toHaveLength(1)
    })

    test('publishes nothing when the setup is missing', async () => {
        const { rec, publish } = makeRecording()
        expect(await rec.addMontage('nowhere:rec', 'As recorded', 'nowhere')).toBeNull()
        expect(publish).not.toHaveBeenCalledWith('montages', expect.anything())
    })
})
