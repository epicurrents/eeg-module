/**
 * Epicurrents EEG label.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { ResourceLabel } from '@epicurrents/core'
import type { AnnotationLabelTemplate, AnnotationOptions, } from '@epicurrents/core/dist/types'

const SCOPE = 'EegLabel'

export default class EegLabel extends ResourceLabel {

    public static fromTemplate (tpl: AnnotationLabelTemplate) {
        return new EegLabel(tpl.value, {
            annotator: tpl.annotator || undefined,
            class: tpl.class || undefined,
            codes: tpl.codes || undefined,
            label: tpl.label || undefined,
            priority: tpl.priority || undefined,
            text: tpl.text || undefined,
            visible: tpl.visible || undefined,
        })
    }

    constructor (
        // Required properties:
        value: boolean | number | number[] | string | string[] | null,
        // Optional properties:
        options?: AnnotationOptions
    ) {
        super(SCOPE, value, options)
    }
}
