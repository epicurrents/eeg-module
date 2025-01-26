/**
 * Epicurrents EEG annotation.
 * @package    epicurrents/eeg-module
 * @copyright  2024 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalAnnotation } from '@epicurrents/core'
import {
    type AnnotationTemplate,
    type BiosignalAnnotation,
    type SettingsColor,
} from '@epicurrents/core/dist/types'


//const SCOPE = 'EegAnnotation'

export default class EegAnnotation extends GenericBiosignalAnnotation {

    public static fromTemplate (tpl: AnnotationTemplate) {
        return new EegAnnotation(
            tpl.start, tpl.duration, tpl.label,
            tpl.class, tpl.channels, tpl.priority, tpl.text, tpl.visible, tpl.background, tpl.color, tpl.opacity
        )
    }

    constructor (
        // Required properties:
        start: number, duration: number, label: string,
        // Optional properties:
        annoClass?: BiosignalAnnotation['class'], channels?: number[], priority?: number, text?: string,
        visible?: boolean, background?: boolean, color?: SettingsColor, opacity?: number
    ) {
        super(
            'EegAnnotation', start, duration, label,
            annoClass, channels, priority, text, visible, background, color, opacity
        )
    }
}
