/**
 * Epicurrents EEG montage channel.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericMontageChannel } from '@epicurrents/core'
import { type MontageChannel, type BiosignalChannel } from '@epicurrents/core/dist/types'

//const SCOPE = 'EegMontageChannel'

export default class EegMontageChannel extends GenericMontageChannel implements MontageChannel {

    constructor (
        name: string, label: string, type: string,
        active: number, reference: number[], averaged: boolean,
        samplingRate: number, unit: string, visible: boolean,
        extraProperties: Partial<BiosignalChannel> = {}
    ) {
        super(name, label, type, active, reference, averaged, samplingRate, unit, visible, extraProperties)
    }

    get active () {
        return this._active
    }

    get averaged () {
        return this._averaged
    }

    get reference () {
        return this._reference
    }

}
