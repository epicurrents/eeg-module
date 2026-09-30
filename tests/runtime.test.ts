/**
 * Unit tests for the EEG runtime module: the property mutations the application routes through it.
 * Each one validates before it acts, and a rejected value has to leave the resource as it was rather
 * than reaching it as a NaN or a null.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test, vi } from 'vitest'
import type { DataResource, StateManager } from '@epicurrents/core/types'
import EEG from '../src/runtime'

/** A resource recording every mutation the module attempts on it. */
const resourceStub = () => ({
    activeMontage: 'default:10-20:rec',
    filters: { highpass: 0, lowpass: 0, notch: 0 },
    sensitivity: 100,
    timebase: 10,
    timebaseUnit: 'page',
    setActiveMontage: vi.fn().mockResolvedValue(true),
    setHighpassFilter: vi.fn().mockResolvedValue(true),
    setLowpassFilter: vi.fn().mockResolvedValue(true),
    setNotchFilter: vi.fn().mockResolvedValue(true),
    setSignalPolarityInverted: vi.fn().mockResolvedValue(true),
})

const set = (property: string, value: unknown, resource = resourceStub()) => {
    EEG.setPropertyValue(property, value, resource as unknown as DataResource)
    return resource
}

describe('module identity', () => {
    test('names itself by the code the registry keys on', () => {
        expect(EEG.moduleName.code).toBe('eeg')
        expect(EEG.moduleName.short).toBe('EEG')
    })

    test('applyConfiguration overrides only the names it is given', async () => {
        await EEG.applyConfiguration({ moduleName: { short: 'Aivosähkö' } })
        expect(EEG.moduleName.short).toBe('Aivosähkö')
        expect(EEG.moduleName.full).toBe('Electroencephalography')
        await EEG.applyConfiguration({ moduleName: { short: 'EEG' } })
    })
})

describe('active montage', () => {
    test('a name, an index and null are all accepted', () => {
        expect(set('active-montage', 'default:10-20:avg').setActiveMontage).toHaveBeenCalledWith('default:10-20:avg')
        expect(set('active-montage', 2).setActiveMontage).toHaveBeenCalledWith(2)
        expect(set('active-montage', null).setActiveMontage).toHaveBeenCalledWith(null)
    })

    test('anything else is refused', () => {
        expect(set('active-montage', { name: 'avg' }).setActiveMontage).not.toHaveBeenCalled()
        expect(set('active-montage', true).setActiveMontage).not.toHaveBeenCalled()
    })
})

describe('filters', () => {
    test('a non-negative frequency is applied, and zero means off', () => {
        expect(set('highpass-filter', 0.5).setHighpassFilter).toHaveBeenCalledWith(0.5)
        expect(set('lowpass-filter', 70).setLowpassFilter).toHaveBeenCalledWith(70)
        expect(set('notch-filter', 0).setNotchFilter).toHaveBeenCalledWith(0)
    })

    test('a negative frequency is refused rather than applied', () => {
        // A negative corner frequency has no meaning, and the filter designer would either throw or
        // produce coefficients nobody intended.
        expect(set('highpass-filter', -1).setHighpassFilter).not.toHaveBeenCalled()
        expect(set('lowpass-filter', -1).setLowpassFilter).not.toHaveBeenCalled()
        expect(set('notch-filter', -50).setNotchFilter).not.toHaveBeenCalled()
    })

    test('a non-numeric value is refused', () => {
        expect(set('highpass-filter', '0.5').setHighpassFilter).not.toHaveBeenCalled()
        expect(set('lowpass-filter', null).setLowpassFilter).not.toHaveBeenCalled()
    })
})

describe('polarity, sensitivity and timebase', () => {
    test('polarity takes a boolean and nothing else', () => {
        expect(set('signal-polarity-inverted', true).setSignalPolarityInverted).toHaveBeenCalledWith(true)
        expect(set('signal-polarity-inverted', false).setSignalPolarityInverted).toHaveBeenCalledWith(false)
        expect(set('signal-polarity-inverted', 1).setSignalPolarityInverted).not.toHaveBeenCalled()
    })

    test('sensitivity and timebase must be positive, since zero would collapse the display', () => {
        expect(set('sensitivity', 70).sensitivity).toBe(70)
        expect(set('sensitivity', 0).sensitivity).toBe(100)
        expect(set('sensitivity', -70).sensitivity).toBe(100)
        expect(set('timebase', 30).timebase).toBe(30)
        expect(set('timebase', 0).timebase).toBe(10)
    })

    test('the timebase unit must be a non-empty string', () => {
        expect(set('timebase-unit', 'sec').timebaseUnit).toBe('sec')
        expect(set('timebase-unit', '').timebaseUnit).toBe('page')
        expect(set('timebase-unit', 5).timebaseUnit).toBe('page')
    })
})

describe('resource resolution', () => {
    test('an unknown property is ignored rather than assigned', () => {
        const resource = set('not-a-property', 'x')
        expect((resource as unknown as Record<string, unknown>)['not-a-property']).toBeUndefined()
    })

    test('with no resource given, the first active resource of the active dataset is used', () => {
        const resource = resourceStub()
        const state = {
            APP: { activeDataset: { activeResources: [resource] } },
        } as unknown as StateManager
        EEG.setPropertyValue('sensitivity', 42, undefined, state)
        expect(resource.sensitivity).toBe(42)
    })

    test('nothing happens when neither a resource nor an active one can be found', () => {
        expect(() => EEG.setPropertyValue('sensitivity', 42)).not.toThrow()
        expect(() => EEG.setPropertyValue('sensitivity', 42, undefined, {
            APP: { activeDataset: null },
        } as unknown as StateManager)).not.toThrow()
    })
})

describe('mutation failures', () => {
    test('a rejected mutation is reported rather than dropped', async () => {
        // The mutations are asynchronous while this entry point is not, so a rejection has to be
        // caught here; unhandled, a filter that failed on the worker side would be reported nowhere.
        const { Log } = await import('scoped-event-log')
        const logSpy = vi.spyOn(Log, 'error').mockImplementation(() => undefined as never)
        const resource = resourceStub()
        resource.setHighpassFilter.mockRejectedValue(new Error('worker refused'))
        EEG.setPropertyValue('highpass-filter', 1, resource as unknown as DataResource)
        await Promise.resolve()
        await Promise.resolve()
        expect(logSpy).toHaveBeenCalled()
        logSpy.mockRestore()
    })
})
