/**
 * Epicurrents EEG event.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalEvent, codedEventsFromVocabulary, mergeCodedEvents } from '@epicurrents/core'
import type {
    AnnotationEventTemplate,
    BiosignalAnnotationEventOptions,
    CodedEventTable,
    CodedEventVocabulary,
    SettingsColor,
} from '@epicurrents/core/types'
import type { EegResourceEvent } from '#types'
import vocabulary from '#components/vocabulary/eeg-events.json'

const SCOPE = 'EegEvent'

/**
 * The EEG vocabulary: activation procedures and stimuli, and the finding categories the viewer names. Stacked on
 * the shared acquisition set of `GenericBiosignalEvent`.
 */
const _CODED_EVENTS = codedEventsFromVocabulary(vocabulary as CodedEventVocabulary)
/** The merged view, built on first access. Its category objects are live, so it never goes stale. */
let _mergedCodedEvents: CodedEventTable | null = null

export default class EegEvent extends GenericBiosignalEvent implements EegResourceEvent {
    /**
     * The shared acquisition set followed by the EEG categories: ACTIVATION (`epicurrents.eeg`, with DICOM CID 3035
     * and IEEE MDC crosswalks where the standards have a term) and the finding categories, from
     * `src/components/vocabulary/eeg-events.json`.
     */
    static get CODED_EVENTS (): CodedEventTable {
        if (!_mergedCodedEvents) {
            _mergedCodedEvents = mergeCodedEvents(super.CODED_EVENTS, _CODED_EVENTS)
        }
        return _mergedCodedEvents
    }
    /**
     * Create a new EEG event from a template.
     * @param tpl - The annotation event template.
     * @returns A new EegEvent instance.
     */
    public static fromTemplate (tpl: AnnotationEventTemplate) {
        return new EegEvent(
            tpl.start, tpl.duration, GenericBiosignalEvent.labelFromTemplate(tpl),
            {
                annotator: tpl.annotator || undefined,
                background: tpl.background || undefined,
                channels: tpl.channels || undefined,
                class: tpl.class || undefined,
                color: tpl.color as SettingsColor || undefined,
                codes: tpl.codes || undefined,
                label: tpl.label || undefined,
                locked: tpl.locked || undefined,
                opacity: tpl.opacity || undefined,
                priority: tpl.priority || undefined,
                text: tpl.text || undefined,
                visible: tpl.visible || undefined,
            }
        )
    }
    /**
     * Create a new EEG event.
     * @param start - Starting time of the event in seconds after recording start.
     * @param duration - Duration of the event in seconds (0 for instantaneous events).
     * @param label - Human-readable label for the event.
     * @param options - Optional event properties.
     */
    constructor (
        // Required properties:
        start: number, duration: number, label: string,
        // Optional properties:
        options?: BiosignalAnnotationEventOptions
    ) {
        super(SCOPE, start, duration, label, options)
    }
}
