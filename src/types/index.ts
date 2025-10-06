import type {
    BiosignalChannel,
    BiosignalHeaderSignal,
    BiosignalMontage,
    BiosignalMontageTemplate,
    BiosignalResource,
    BiosignalSetup,
    BiosignalStudyProperties,
    ConfigBiosignalSetup,
    ConfigMapChannels,
    MontageChannel,
    SourceChannel,
    VideoAttachment,
} from '@epicurrents/core/dist/types'

/**
 * Properties expected of an EEG file header signal.
 */
export type EegHeaderSignal = BiosignalHeaderSignal & {
    signal: Float32Array
}
/** MontageChannel extended with additional EEG montage channel properties. */
export type EegMontageChannelProperties = MontageChannel & {
    /**
     * The montage channel in the corresponding contralateral (homologous) position.
     * 
     * The matching depends on the channel names following the international standard (10-x) EEG naming conventions.
     * The channel name should start with the standard channel designator (e.g. 'F3', 'C4', 'Pz' etc.) and may be
     * followed by additional suffixes. The matching is case-insensitive.
     * 
     * Results may be unpredictable if the naming is non-standard.
     */
    contralateralChannelPair: EegMontageChannelProperties | null
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

export type EegStudyProperties = BiosignalStudyProperties & {
    videos?: VideoAttachment[]
}

import { type EegModuleSettings } from './config'

export {
    EegModuleSettings,
}
