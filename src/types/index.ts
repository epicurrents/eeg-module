import {
    type BiosignalHeaderSignal,
    type BiosignalResource,
    type VideoAttachment,
} from '@epicurrents/core/dist/types'
import { type BiosignalStudyProperties } from '@epicurrents/core/dist/types/biosignal'

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
    setupCache: () => Promise<boolean>
}

export type EegStudyProperties = BiosignalStudyProperties & {
    videos?: VideoAttachment[]
}

import { type EegModuleSettings } from './config'

export {
    EegModuleSettings,
}