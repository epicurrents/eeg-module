/**
 * Epicurrents EEG label.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { ResourceLabel } from '@epicurrents/core'
import type { AnnotationLabelTemplate, AnnotationLabel, } from '@epicurrents/core/dist/types'

const SCOPE = 'EegLabel'

export default class EegLabel extends ResourceLabel {

    public static fromTemplate (tpl: AnnotationLabelTemplate) {
        return new EegLabel(
            tpl.value,
            tpl.label, tpl.class, tpl.codes, tpl.priority, tpl.text, tpl.visible
        )
    }

    constructor (
        // Required properties:
        value: boolean | number | number[] | string | string[],
        // Optional properties:
        label?: string, annoClass?: AnnotationLabel['class'], codes?: (number | string)[], priority?: number, text?: string,
        visible?: boolean,
    ) {
        super(
            SCOPE, value,
            label, annoClass, codes, priority, text, visible
        )
    }
}
