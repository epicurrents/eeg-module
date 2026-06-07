import type {
    BiosignalAnnotationEvent,
    BiosignalChannel,
    BiosignalHeaderSignal,
    BiosignalMontage,
    BiosignalMontageTemplate,
    BiosignalResource,
    BiosignalSetup,
    BiosignalStudyProperties,
    ConfigBiosignalSetup,
    ConfigMapChannels,
    SourceChannel,
    VideoAttachment,
} from '@epicurrents/core/dist/types'

/**
 * Properties expected of an EEG file header signal.
 */
export type EegHeaderSignal = BiosignalHeaderSignal & {
    signal: Float32Array
}
/**
 * Resource containing primarily EEG signals.
 */
export interface EegResource extends BiosignalResource {
    // Properties
    channels: SourceChannel[]
    /** Maximum number of samples in a record of displayed signals. */
    maxSampleCount: number
    /** Maximum sampling rate of displayed signals. */
    maxSamplingRate: number
    /**
     * Register one cascade montage per entry whose source candidates resolve against the keyed setup on this recording.
     * The `entriesBySetup` map mirrors the `extraMontages` shape: setup name → entries that should build against that
     * setup. For each entry, candidates are tried in priority order against the keyed setup; the first one whose name
     * or label matches a channel wins. Entries whose candidates all fail to resolve are silently skipped, as are setups
     * not registered on this recording.
     * @param entriesBySetup - Per-setup cascade definitions; see `EegCascadeMontage` for the per-row slice semantics.
     */
    addCascadeMontagesFromEntries (entriesBySetup: {
        [setup: string]: {
            id: string,
            label: string,
            candidates: string[],
            rowCount: number,
            pageLength: number,
            /** Initial sensitivity for the cascade montage (units match the recording's). */
            sensitivity?: number,
            /** Initial highpass filter (Hz). 0 or omitted = off. */
            highpass?: number,
            /** Initial lowpass filter (Hz). 0 or omitted = off. */
            lowpass?: number,
            /** Initial notch filter (Hz). 0 or omitted = off. */
            notch?: number,
        }[]
    }): Promise<void>
    /**
     * Add a new montage to the resource.
     * @param name - Unique name for the montage.
     * @param label - Human-readable label for the montage (displayed in UI).
     * @param setup - Electrode setup to use.
     * @param template - Channel template for the montage.
     * @param config - Additional configuration for the montage.
     * @returns Promise that resolves with the created montage or null of an error occurred.
     */
    addMontage (
        name: string,
        label: string,
        setup: BiosignalSetup | string,
        template?: BiosignalMontageTemplate,
        config?: ConfigMapChannels
    ): Promise<BiosignalMontage|null>
    /**
     * Add a new setup to the resource.
     * @param config - Channel configuration for the setup.
     * @param channels - Raw source channels to create the setup for (defaults to existing recording channels).
     * @returns The created setup.
     */
    addSetup (config?: ConfigBiosignalSetup, channels?: BiosignalChannel[]): BiosignalSetup
    /**
     * Prepare the worker for processing signals.
     * @returns Promise that resolves with true if the worker was prepared successfully.
     */
    prepare (): Promise<boolean>
}

export type EegResourceEvent = BiosignalAnnotationEvent & {
}

export type EegStudyProperties = BiosignalStudyProperties & {
    videos?: VideoAttachment[]
}

import { type EegModuleSettings } from './config'

export {
    EegModuleSettings,
}
