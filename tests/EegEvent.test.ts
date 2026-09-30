/**
 * EegEvent: the merged coded-event view and the EEG vocabulary file.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import EegEvent from '../src/components/EegEvent'
import vocabulary from '../src/components/vocabulary/eeg-events.json'

const CATEGORIES = Object.keys(vocabulary.categories)

describe('EegEvent', () => {
    test('CODED_EVENTS contains background alpha', () => {
        const ev = EegEvent.getEventForCode('EEG_BKG_ALPHA')
        expect(ev).not.toBeNull()
        expect(ev?.name).toContain('alpha')
    })

    test('getEventForCode recognizes dicom code', () => {
        const ev = EegEvent.getEventForCode('MDC/2:23592', 'dicom')
        expect(ev).not.toBeNull()
        expect(ev?.code).toBe('EEG_BKG_ALPHA')
    })

    test('getEventForLabel finds by name', () => {
        const ev = EegEvent.getEventForLabel('Background alpha activity')
        expect(ev).not.toBeNull()
        expect(ev?.code).toBe('EEG_BKG_ALPHA')
    })

    test('lists the shared categories before its own', () => {
        expect(Object.keys(EegEvent.CODED_EVENTS)).toEqual([
            'TECHNICAL', 'INTERVENTION', 'OBSERVATION', 'ENVIRONMENT', 'PHYSIOLOGY', ...CATEGORIES,
        ])
    })

    test('finds a shared acquisition term through the EEG class', () => {
        expect(EegEvent.getEventForCode('BIO_TECH_CALIBRATION')?.name).toBe('Calibration')
        expect(EegEvent.getEventForLabel('Responds to voice')?.code).toBe('BIO_OBS_LOC_VOICE')
    })

    test('carries the sensory stimuli as activation terms', () => {
        for (const code of [
            'EEG_ACT_STIM_AUDITORY', 'EEG_ACT_STIM_VERBAL', 'EEG_ACT_STIM_TACTILE', 'EEG_ACT_STIM_NOXIOUS',
            'EEG_ACT_STIM_VISUAL', 'EEG_ACT_PASSIVE_EYE_OPENING',
        ]) {
            expect(EegEvent.getEventForCode(code)?.class, code).toBe('activation')
        }
        expect(EegEvent.getEventForCode('EEG_ACT_STIM_NOXIOUS')?.meta).toHaveProperty('method')
    })

    test('carries the crosswalk corrections checked against CID 3035', () => {
        expect(EegEvent.getEventForCode('EEG_ART_EYE_MOVEMENT')?.standardCodes).toEqual({
            dicom: 'MDC/2:24040',
            ieee: 'MDC_EEG_EXT_CRTX_EYE_MVMT_MULT',
        })
        expect(EegEvent.getEventForCode('EEG_ART_EXTERNAL')?.standardCodes?.dicom).toBe('MDC/2:24272')
        expect(EegEvent.getEventForCode('EEG_EPI_POLYSPIKE')?.name).toBe('Polyspike')
        expect(EegEvent.getEventForCode('EEG_TRN_SHARP')?.name).toBe('Sharply contoured wave')
    })

    test('extends an EEG category through the merged view', () => {
        EegEvent.extendEvents('OTHER', { TEST_ONLY: { code: 'EEG_OTH_TEST_ONLY', name: 'Test only' } })
        expect(EegEvent.getEventForCode('EEG_OTH_TEST_ONLY')?.name).toBe('Test only')
    })

    test('fromTemplate creates an EegEvent instance', () => {
        const tpl: any = { start: 1, duration: 2, label: 'test' }
        const e = EegEvent.fromTemplate(tpl)
        expect(e).toBeInstanceOf(EegEvent)
        expect(e.start).toBe(1)
    })
})

describe('EegEvent.fromTemplate', () => {
    // The annotation constructors read an absent option as a request for the default, so a template
    // field that can legitimately be falsy has to survive the copy as itself.
    const template = (fields: Record<string, unknown> = {}) =>
        ({ start: 1, duration: 2, label: 'test', ...fields } as never)

    test('a template marked hidden produces a hidden event', () => {
        expect(EegEvent.fromTemplate(template({ visible: false })).visible).toBe(false)
        expect(EegEvent.fromTemplate(template({ visible: true })).visible).toBe(true)
        expect(EegEvent.fromTemplate(template()).visible).toBe(true)
    })

    test('a fully transparent event keeps its opacity', () => {
        // Opacity is assigned unguarded, so an absent one reaches the renderer as undefined and is
        // drawn at whatever the renderer defaults to — which for a zero means fully opaque.
        expect(EegEvent.fromTemplate(template({ opacity: 0 })).opacity).toBe(0)
        expect(EegEvent.fromTemplate(template({ opacity: 0.5 })).opacity).toBe(0.5)
        expect(EegEvent.fromTemplate(template()).opacity).toBeUndefined()
    })

    test('the remaining falsy-capable fields arrive as themselves', () => {
        // These three share their own default, so a dropped value resolves back to it and they cannot
        // distinguish the two operators; `visible` and `opacity` above are the ones that can. They are
        // copied the same way, which is why the whole set was changed together.
        const event = EegEvent.fromTemplate(template({ background: false, locked: false, priority: 0 }))
        expect(event.background).toBe(false)
        expect(event.locked).toBe(false)
        expect(event.priority).toBe(0)
    })

    test('a named channel list is carried across, and an absent one means every channel', () => {
        // The constructor normalises an absent list to an empty one, and an empty list is what the
        // renderer reads as "applies to every channel" — so the two are the same statement and the
        // copy only has to preserve a list that names channels.
        expect(EegEvent.fromTemplate(template({ channels: ['C3', 'P3'] })).channels).toEqual(['C3', 'P3'])
        expect(EegEvent.fromTemplate(template({ channels: [] })).channels).toEqual([])
        expect(EegEvent.fromTemplate(template()).channels).toEqual([])
    })

    test('the label falls back to the template value when no label is given', () => {
        expect(EegEvent.fromTemplate(template({ label: undefined, value: 'spike' })).label).toBe('spike')
    })
})

describe('eeg-events.json', () => {
    const terms = Object.entries(vocabulary.categories).flatMap(
        ([category, { events }]) => Object.entries(events).map(([key, term]) => ({ category, key, term }))
    )

    test('names its standard and version', () => {
        expect(vocabulary.standard).toBe('epicurrents.eeg')
        expect(vocabulary.version).toMatch(/^\d+\.\d+$/)
    })

    test('scopes activation to acquisition and everything else to findings', () => {
        for (const [name, category] of Object.entries(vocabulary.categories)) {
            expect(category.scope, name).toBe(name === 'ACTIVATION' ? 'acquisition' : 'finding')
        }
    })

    test('gives every term a unique EEG code and a name, and every activation term its class', () => {
        const codes = new Set<string>()
        for (const { category, key, term } of terms) {
            expect(term.code, key).toMatch(/^EEG_[A-Z0-9_]+$/)
            expect(codes.has(term.code), `duplicate ${term.code}`).toBe(false)
            codes.add(term.code)
            expect(term.name.length, key).toBeGreaterThan(0)
            if (category === 'ACTIVATION') {
                expect((term as { class?: string }).class, key).toBe('activation')
            }
        }
    })

    test('uses only the three crosswalk columns', () => {
        for (const { key, term } of terms) {
            for (const standard of Object.keys((term as { standardCodes?: object }).standardCodes ?? {})) {
                expect(['dicom', 'ieee', 'snomed'], `${key}: ${standard}`).toContain(standard)
            }
        }
    })
})
