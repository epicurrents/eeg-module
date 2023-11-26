import {
    BiosignalHeaderSignal,
    BiosignalResource,
    VideoAttachment,
} from "@epicurrents/core/dist/types"
import { BiosignalStudyProperties } from "@epicurrents/core/dist/types/biosignal"

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
    /** Maximum number of samples in a record of displayed signals. */
    maxSampleCount: number
    /** Maximum sampling rate of displayed signals. */
    maxSamplingRate: number
    prepare (): Promise<boolean>
    setupBuffer: () => Promise<boolean>
}

export type EegStudyProperties = BiosignalStudyProperties & {
    videos?: VideoAttachment[]
}