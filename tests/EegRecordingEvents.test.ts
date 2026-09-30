/**
 * Unit tests for the annotation handling on EegRecording: the deployment-configured ignore and
 * convert patterns the events setter applies, and the template constructors.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { beforeEach, describe, expect, test } from 'vitest'
import type { BiosignalAnnotationEvent } from '@epicurrents/core/types'
import EegRecording from '../src/EegRecording'

;(window as unknown as { __EPICURRENTS__: unknown }).__EPICURRENTS__ = {
    RUNTIME: { SETTINGS: { modules: { eeg: {} }, app: {} } },
}

const makeRecording = (events: { ignorePatterns?: string[], convertPatterns?: unknown[] } = {}) => {
    const rec = new EegRecording(
        'r',
        [{
            name: 'C3', label: 'C3', modality: 'eeg', averaged: false,
            samplingRate: 256, unit: 'uV', visible: true, sampleCount: 100,
        }] as never,
        { recordingStartTime: 0, dataUnitCount: 10, dataUnitDuration: 1 } as never,
        { addEventListener: () => undefined } as never,
    )
    ;(rec as unknown as { _SETTINGS: unknown })._SETTINGS = {
        events: { ignorePatterns: events.ignorePatterns ?? [], convertPatterns: events.convertPatterns ?? [] },
    }
    return rec
}

/** An event carrying only what the setter reads. */
const event = (label: string, fields: Record<string, unknown> = {}) =>
    ({ label, annotator: 'original', text: 'original text', ...fields } as unknown as BiosignalAnnotationEvent)

describe('EegRecording events setter — ignorePatterns', () => {
    test('drops every event whose label matches, and keeps the rest in order', () => {
        const rec = makeRecording({ ignorePatterns: ['^Impedance'] })
        rec.events = [event('Impedance check'), event('Spike'), event('Impedance again'), event('Burst')]
        expect(rec.events.map(e => e.label)).toEqual(['Spike', 'Burst'])
    })

    test('drops consecutive matches without skipping the one after them', () => {
        // The setter splices from the array it is iterating; an index that is not stepped back skips
        // whatever moved into the removed slot, so two matches in a row would leave the second in.
        const rec = makeRecording({ ignorePatterns: ['^drop'] })
        rec.events = [event('drop 1'), event('drop 2'), event('drop 3'), event('keep')]
        expect(rec.events.map(e => e.label)).toEqual(['keep'])
    })

    test('drops a match in the last position', () => {
        const rec = makeRecording({ ignorePatterns: ['^drop'] })
        rec.events = [event('keep'), event('drop')]
        expect(rec.events.map(e => e.label)).toEqual(['keep'])
    })

    test('the pattern is a regular expression rather than a literal', () => {
        const rec = makeRecording({ ignorePatterns: ['\\d+ Hz'] })
        rec.events = [event('Photic 10 Hz'), event('Photic')]
        expect(rec.events.map(e => e.label)).toEqual(['Photic'])
    })

    test('an unanchored pattern matches anywhere in the label', () => {
        const rec = makeRecording({ ignorePatterns: ['artifact'] })
        rec.events = [event('Movement artifact present'), event('Movement')]
        expect(rec.events.map(e => e.label)).toEqual(['Movement'])
    })

    test('with no patterns configured every event is kept', () => {
        const rec = makeRecording()
        rec.events = [event('a'), event('b')]
        expect(rec.events.map(e => e.label)).toEqual(['a', 'b'])
    })
})

describe('EegRecording events setter — convertPatterns', () => {
    const converted = (label: string) => [[label, {
        annotator: 'converter', channels: ['C3'], class: 'activation', label: 'Photic $1 Hz',
        priority: 5, text: 'replaced', type: 'event',
    }]] as never[]

    test('rewrites the label through the pattern, so a capture group reaches the replacement', () => {
        const rec = makeRecording({ convertPatterns: converted('^PHOTIC (\\d+)$') })
        rec.events = [event('PHOTIC 14')]
        expect(rec.events[0].label).toBe('Photic 14 Hz')
    })

    test('replaces the descriptive fields of a matching event', () => {
        const rec = makeRecording({ convertPatterns: converted('^PHOTIC (\\d+)$') })
        rec.events = [event('PHOTIC 14')]
        expect(rec.events[0]).toMatchObject({
            annotator: 'converter', channels: ['C3'], class: 'activation',
            priority: 5, text: 'replaced', type: 'event',
        })
    })

    test('keeps the event annotator when the pattern names none', () => {
        // The annotator is who said it, which a relabelling does not change; the other fields are what
        // was said, which it does.
        const rec = makeRecording({ convertPatterns: [['^PHOTIC', { label: 'Photic' }]] as never[] })
        rec.events = [event('PHOTIC 14')]
        expect(rec.events[0].annotator).toBe('original')
    })

    test('applies every matching pattern rather than stopping at the first', () => {
        // A label can describe more than one thing a deployment wants rewritten, so the second pattern
        // has to see the result of the first.
        const rec = makeRecording({ convertPatterns: [
            ['^PHOTIC', { label: 'Photic', priority: 1 }],
            ['Photic', { label: 'Photic stimulation', priority: 9 }],
        ] as never[] })
        rec.events = [event('PHOTIC 14')]
        expect(rec.events[0].label).toBe('Photic stimulation 14')
        expect(rec.events[0].priority).toBe(9)
    })

    test('leaves an event no pattern matches untouched', () => {
        const rec = makeRecording({ convertPatterns: converted('^PHOTIC') })
        rec.events = [event('Spike')]
        expect(rec.events[0]).toMatchObject({ label: 'Spike', annotator: 'original', text: 'original text' })
    })

    test('an ignored event is never converted', () => {
        // Ignoring is checked first and continues the outer loop, so the two rules cannot both act on
        // one event.
        const rec = makeRecording({
            ignorePatterns: ['^PHOTIC'],
            convertPatterns: converted('^PHOTIC'),
        })
        rec.events = [event('PHOTIC 14'), event('Spike')]
        expect(rec.events.map(e => e.label)).toEqual(['Spike'])
    })
})

describe('EegRecording events setter — without settings', () => {
    test('assigns nothing when the module settings are missing', () => {
        // The patterns are the deployment's, so applying none of them and storing the events anyway
        // would publish labels the deployment has said it does not want shown.
        const rec = makeRecording()
        ;(rec as unknown as { _SETTINGS: unknown })._SETTINGS = null
        rec.events = [event('a')]
        expect(rec.events).toEqual([])
    })
})

describe('EegRecording annotation templates', () => {
    let rec: EegRecording
    beforeEach(() => {
        rec = makeRecording()
    })

    test('addEventsFromTemplates returns the constructed events and stores them', () => {
        const events = rec.addEventsFromTemplates(null, { start: 1, duration: 0, label: 'Spike' } as never)
        expect(events).toHaveLength(1)
        expect(events[0].label).toBe('Spike')
        expect(rec.events).toHaveLength(1)
    })

    test('addLabelsFromTemplates returns the constructed labels and stores them', () => {
        const labels = rec.addLabelsFromTemplates(null, { value: 'reviewed' } as never)
        expect(labels).toHaveLength(1)
        expect(labels[0].value).toBe('reviewed')
        expect((rec as unknown as { _labels: unknown[] })._labels).toHaveLength(1)
    })

    test('the stored annotations are the constructed objects, not a context argument', () => {
        // The template methods pass a property-change context ahead of the annotations; storing it
        // alongside them would put an object with no label into the event list.
        rec.addEventsFromTemplates(null, { start: 1, duration: 0, label: 'Spike' } as never)
        expect(rec.events.every(e => typeof e.label === 'string')).toBe(true)
    })
})
