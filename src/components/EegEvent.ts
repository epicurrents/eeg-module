/**
 * Epicurrents EEG event.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalEvent } from '@epicurrents/core'
import type {
    AnnotationEventTemplate,
    BiosignalAnnotationEventOptions,
    SettingsColor,
} from '@epicurrents/core/dist/types'

const SCOPE = 'EegEvent'

export default class EegEvent extends GenericBiosignalEvent {

    public static fromTemplate (tpl: AnnotationEventTemplate) {
        return new EegEvent(
            tpl.start, tpl.duration, tpl.label || '',
            {
                annotator: tpl.annotator || undefined,
                background: tpl.background || undefined,
                channels: tpl.channels || undefined,
                class: tpl.class || undefined,
                color: tpl.color as SettingsColor || undefined,
                codes: tpl.codes || undefined,
                label: tpl.label || undefined,
                opacity: tpl.opacity || undefined,
                priority: tpl.priority || undefined,
                text: tpl.text || undefined,
                visible: tpl.visible || undefined,
            }
        )
    }

    constructor (
        // Required properties:
        start: number, duration: number, label: string,
        // Optional properties:
        options?: BiosignalAnnotationEventOptions
    ) {
        super(SCOPE, start, duration, label, options)
    }
}
