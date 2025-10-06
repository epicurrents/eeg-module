/**
 * Epicurrents EEG source channel.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericSourceChannel } from '@epicurrents/core'
import type { BiosignalChannel } from '@epicurrents/core/dist/types'
import { Log } from 'scoped-event-log'

const SCOPE = 'EegSourceChannel'

export default class EegSourceChannel extends GenericSourceChannel implements GenericSourceChannel {

    constructor (
        name: string, label: string, modality: string,
        index: number, averaged: boolean,
        samplingRate: number, unit: string, visible: boolean,
        extraProperties: Partial<BiosignalChannel> = {}
    ) {
        super(name, label, modality, index, averaged, samplingRate, unit, visible, extraProperties)
        // Try to determine laterality if it hasn't been explicitly set.
        if (!this._laterality && this.modality === 'eeg') {
            const nameProps = this.name.match(/([a-zA-Z]+)(\d+)?(.+)?/)
            if (nameProps?.[2]) {
                this._laterality = parseInt(nameProps[2])%2 ? 's' : 'd'
                Log.debug(`Determined laterality of channel ${this.name} to be '${this._laterality}'`, SCOPE)
            } else if (nameProps?.[1].toLowerCase().endsWith('z')) {
                this._laterality = 'z'
                Log.debug(`Determined laterality of channel ${this.name} to be '${this._laterality}'`, SCOPE)
            }
        }
    }
}
