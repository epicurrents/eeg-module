/**
 * The HED-SCORE term index: the generated file's shape and the loader's lookups.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import { HED_SCORE_INDEX_FORMAT, createHedScoreTermIndex, loadHedScoreIndex } from '../src/hed'
import type { HedScoreIndex } from '../src/types/hed'
import index from '../src/components/vocabulary/hed-score.json'

const raw = index as HedScoreIndex

describe('the generated index', () => {
    test('names the release it was generated from', () => {
        expect(raw.format).toBe(HED_SCORE_INDEX_FORMAT)
        expect(raw.schema.library).toBe('score')
        expect(raw.schema.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(raw.license).toBe('CC-BY-4.0')
        expect(raw.attribution).toContain('HED Contributors')
    })

    test('lists every term once, parents before children, under a listed branch', () => {
        const seen = new Set<string>()
        for (const term of raw.terms) {
            expect(seen.has(term.name)).toBe(false)
            if (term.parent === null) {
                expect(raw.branches).toContain(term.name)
            } else {
                expect(seen.has(term.parent)).toBe(true)
            }
            seen.add(term.name)
        }
        expect(raw.branches.every(branch => seen.has(branch))).toBe(true)
    })

    test('carries no value placeholder as a term', () => {
        expect(raw.terms.some(term => term.name === '#')).toBe(false)
    })

    test('has the units of every unit class a term names, default included', () => {
        for (const term of raw.terms) {
            for (const unitClass of term.unitClasses ?? []) {
                const units = raw.units[unitClass]
                expect(units).toBeDefined()
                expect(units.units).toContain(units.default)
            }
        }
        expect(raw.units.frequencyUnits.units).toEqual(expect.arrayContaining(['Hz', 'kHz', 'hertz']))
    })
})

describe('the term index', () => {
    const terms = createHedScoreTermIndex(raw)

    test('looks terms up by short form', () => {
        expect(terms.getTerm('Feature-frequency')?.valueClasses).toEqual(['numericClass'])
        expect(terms.getTerm('Feature-frequency')?.unitClasses).toEqual(['frequencyUnits'])
        expect(terms.getTerm('Not-a-term')).toBeNull()
    })

    test('resolves a nested term to its top-level branch', () => {
        expect(terms.branchOf('Sensor-list')).toBe('Feature-property')
        expect(terms.branchOf('Modulator')).toBe('Modulator')
        expect(terms.branchOf('Not-a-term')).toBeNull()
    })

    test('refuses an index of another layout', () => {
        expect(() => createHedScoreTermIndex({ ...raw, format: HED_SCORE_INDEX_FORMAT + 1 })).toThrow(/format/)
    })

    test('the loader returns one shared index', async () => {
        const first = await loadHedScoreIndex()
        expect(await loadHedScoreIndex()).toBe(first)
        expect(first.terms.length).toBe(raw.terms.length)
    })
})
