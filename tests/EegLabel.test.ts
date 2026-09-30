/**
 * Unit tests for EegLabel, chiefly the template copy: the annotation constructors read an absent
 * option as a request for the default, so a field that can legitimately be falsy has to survive the
 * copy as itself.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { describe, expect, test } from 'vitest'
import type { AnnotationLabelTemplate } from '@epicurrents/core/types'
import EegLabel from '../src/components/EegLabel'

const template = (fields: Partial<AnnotationLabelTemplate> = {}) => ({
    value: 'lbl', ...fields,
} as AnnotationLabelTemplate)

describe('EegLabel.fromTemplate', () => {
    test('carries the value and the populated fields across', () => {
        const label = EegLabel.fromTemplate(template({
            annotator: 'ann', class: 'evaluation', label: 'Label', priority: 3, text: 'body', visible: true,
        }))
        expect(label).toBeInstanceOf(EegLabel)
        expect(label.value).toBe('lbl')
        expect(label.annotator).toBe('ann')
        expect(label.class).toBe('evaluation')
        expect(label.label).toBe('Label')
        expect(label.priority).toBe(3)
        expect(label.text).toBe('body')
    })

    test('a template marked hidden produces a hidden label', () => {
        // `visible` resolves to `true` when absent, so dropping a `false` on the way through turns a
        // hidden annotation into a visible one.
        expect(EegLabel.fromTemplate(template({ visible: false })).visible).toBe(false)
        expect(EegLabel.fromTemplate(template({ visible: true })).visible).toBe(true)
        expect(EegLabel.fromTemplate(template()).visible).toBe(true)
    })

    test('priority zero arrives as zero', () => {
        // Not a guard on the copy: zero is also the constructor's default, so a dropped `0` resolves
        // back to `0` and the two operators are indistinguishable here. The case that distinguishes
        // them is `visible` above, where the default is `true`. This pins the resolved value.
        expect(EegLabel.fromTemplate(template({ priority: 0 })).priority).toBe(0)
    })

    test('an unlocked template produces an unlocked label', () => {
        expect(EegLabel.fromTemplate(template({ locked: false })).locked).toBe(false)
        expect(EegLabel.fromTemplate(template({ locked: true })).locked).toBe(true)
    })

    test('empty text arrives as empty text', () => {
        // Same shape as `priority` above — the empty string is also the default, so this pins the
        // resolved value rather than the copy.
        expect(EegLabel.fromTemplate(template({ text: '' })).text).toBe('')
    })

    test('a field the template omits takes the constructor default', () => {
        const label = EegLabel.fromTemplate(template())
        expect(label.annotator).toBe('')
        expect(label.text).toBe('')
        expect(label.priority).toBe(0)
    })
})
