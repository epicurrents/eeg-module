/**
 * Unit tests for the bundled setup and montage configuration. A setup is selected by name, and
 * `addSetup` answers a name collision by returning the setup already registered — so two bundled
 * setups sharing a name means one of them is silently discarded, with nothing to say so.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import EegRecording from '../src/EegRecording'
import settings from '../src/config'

const DEFAULTS = EegRecording.DEFAULT_MONTAGES

describe('bundled setups', () => {
    test('every setup is registered under the name it declares', () => {
        // The map key is what `defaultSetups` and every montage identifier are matched against, so a
        // setup whose own `name` disagrees with its key is registered as something else.
        for (const [key, entry] of DEFAULTS) {
            expect(entry.setup.name, key).toBe(key)
        }
    })

    test('no two bundled setups share a name', () => {
        const names = [...DEFAULTS.values()].map(entry => entry.setup.name)
        expect(new Set(names).size).toBe(names.length)
    })

    test('the 10-20 and 10-10 arrays are both registered', () => {
        expect([...DEFAULTS.keys()].sort()).toEqual(['default:10-10', 'default:10-20'])
    })

    test('each setup carries a distinct label, since the label is what a reader picks from', () => {
        const labels = [...DEFAULTS.values()].map(entry => (entry.setup as { label?: string }).label)
        expect(labels.every(Boolean)).toBe(true)
        expect(new Set(labels).size).toBe(labels.length)
    })

    test('every montage a setup declares is registered under its own name too', () => {
        for (const [key, entry] of DEFAULTS) {
            for (const [name, template] of Object.entries(entry.montages)) {
                expect((template as { name?: string }).name, `${key}:${name}`).toBe(name)
            }
        }
    })

    test('every montage named in the settings exists in the setup it is keyed under', () => {
        // A name that does not resolve adds no montage and logs nothing at error level, so the
        // recording simply opens with one montage fewer than the deployment asked for.
        for (const [setupName, montages] of Object.entries(settings.defaultMontages ?? {})) {
            const entry = DEFAULTS.get(setupName)
            expect(entry, setupName).toBeTruthy()
            for (const [montageName] of montages) {
                expect(Object.keys(entry!.montages), `${setupName}:${montageName}`).toContain(montageName)
            }
        }
    })

    test('every setup named in defaultSetups is registered', () => {
        for (const name of settings.defaultSetups ?? []) {
            expect([...DEFAULTS.keys()], name).toContain(name)
        }
    })

    test('an electrode label is written the way the standard writes it', () => {
        // The label is what the viewer displays, and position lookup is case-insensitive, so a
        // mis-cased one resolves correctly and still reads wrongly on screen.
        // The rows of the 10-10 system, plus the earlobe references and the two midline landmarks.
        const known = /^(Fp|AF|FC|CP|PO|FT|TP|Nz|Iz|A[12]$|[FCPOT])/
        for (const [key, entry] of DEFAULTS) {
            for (const channel of entry.setup.channels) {
                const label = (channel as { label?: string }).label
                if (!label || (channel as { modality?: string }).modality !== 'eeg') {
                    continue
                }
                expect(label, `${key}: ${label}`).toMatch(known)
            }
        }
    })
})
