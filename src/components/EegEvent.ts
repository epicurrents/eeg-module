/**
 * Epicurrents EEG event.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalEvent } from '@epicurrents/core'
import type {
    AnnotationEventTemplate,
    BiosignalAnnotationEvent,
    SettingsColor,
} from '@epicurrents/core/dist/types'

const SCOPE = 'EegEvent'

export default class EegEvent extends GenericBiosignalEvent {

    public static fromTemplate (tpl: AnnotationEventTemplate) {
        return new EegEvent(
            tpl.start, tpl.duration, tpl.label,
            tpl.class, tpl.channels, tpl.codes, tpl.priority, tpl.text, tpl.visible, tpl.background, tpl.color,
            tpl.opacity
        )
    }

    constructor (
        // Required properties:
        start: number, duration: number, label: string,
        // Optional properties:
        annoClass?: BiosignalAnnotationEvent['class'], channels?: (number | string)[], codes?: (number | string)[],
        priority?: number, text?: string, visible?: boolean, background?: boolean, color?: SettingsColor,
        opacity?: number
    ) {
        super(
            SCOPE, start, duration, label,
            annoClass, channels, codes, priority, text, visible, background, color, opacity
        )
    }
}
