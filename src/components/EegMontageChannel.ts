/**
 * Epicurrents EEG montage channel.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericMontageChannel } from '@epicurrents/core'
import type {
    DerivedChannelProperties,
    BiosignalChannel,
    BiosignalMontage,
    MontageChannel,
} from '@epicurrents/core/dist/types'

//const SCOPE = 'EegMontageChannel'

export default class EegMontageChannel extends GenericMontageChannel implements MontageChannel {

    constructor (
        montage: BiosignalMontage,
        name: string,
        label: string,
        modality: string,
        active: number | DerivedChannelProperties,
        reference: DerivedChannelProperties,
        averaged: boolean,
        samplingRate: number,
        unit: string,
        visible: boolean,
        extraProperties: Partial<BiosignalChannel> = {}
    ) {
        super(montage, name, label, modality, active, reference, averaged, samplingRate, unit, visible, extraProperties)
    }

}
