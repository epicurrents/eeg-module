/**
 * Epicurrents EEG source channel.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericSourceChannel } from '@epicurrents/core'
import type { BiosignalChannel } from '@epicurrents/core/dist/types'

//const SCOPE = 'EegMontageChannel'

export default class EegSourceChannel extends GenericSourceChannel implements GenericSourceChannel {

    constructor (
        name: string, label: string, modality: string,
        index: number, averaged: boolean,
        samplingRate: number, unit: string, visible: boolean,
        extraProperties: Partial<BiosignalChannel> = {}
    ) {
        super(name, label, modality, index, averaged, samplingRate, unit, visible, extraProperties)
    }

}
