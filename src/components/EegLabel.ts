/**
 * Epicurrents EEG label.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalLabel } from '@epicurrents/core'
import type { AnnotationLabelTemplate, BiosignalAnnotationLabel, } from '@epicurrents/core/dist/types'

const SCOPE = 'EegLabel'

export default class EegLabel extends GenericBiosignalLabel {

    public static fromTemplate (tpl: AnnotationLabelTemplate) {
        return new EegLabel(
            tpl.label,
            tpl.class, tpl.codes, tpl.priority, tpl.text, tpl.visible
        )
    }

    constructor (
        // Required properties:
        label: string,
        // Optional properties:
        annoClass?: BiosignalAnnotationLabel['class'], codes?: (number | string)[], priority?: number, text?: string,
        visible?: boolean,
    ) {
        super(
            SCOPE, label,
            annoClass, codes, priority, text, visible
        )
    }
}
