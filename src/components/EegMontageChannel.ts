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
} from '@epicurrents/core/dist/types'
import type { EegMontageChannelProperties } from '#types'
import { Log } from 'scoped-event-log'

const SCOPE = 'EegMontageChannel'

export default class EegMontageChannel extends GenericMontageChannel implements EegMontageChannelProperties {

    /** The montage channel in the corresponding contralateral position. */
    _contralateralChan: EegMontageChannelProperties | null = null
    /** The montage this channel belongs to. */
    _montage: BiosignalMontage

    constructor (
        montage: BiosignalMontage,
        name: string, label: string, modality: string,
        active: number | DerivedChannelProperties, reference: DerivedChannelProperties,
        averaged: boolean, samplingRate: number, unit: string, visible: boolean,
        extraProperties: Partial<BiosignalChannel> = {}
    ) {
        super(name, label, modality, active, reference, averaged, samplingRate, unit, visible, extraProperties)
        this._montage = montage
    }

    get contralateralChannelPair () {
        if (this.modality !== 'eeg') {
            return null
        } else if (this._contralateralChan) {
            return this._contralateralChan
        }
        // Midline channels don't have a contralateral pair.
        if (this._laterality === 'z') {
            return null
        }
        // Constructing and adding montage channels is a dynamic process and we shouldn't check for the existence of 
        // a channel pair until it is requested for the first time.
        const nameProps = this.name.match(/([a-zA-Z]+)(\d+)(.+)?/)
        if (!nameProps) {
            return null
        }
        // Check if this is a left or right hemisphere channel.
        const laterality = this._laterality ? this._laterality
                         : parseInt(nameProps[2])%2 ? 's' : 'd'
        // Depending on the side,  we either add or subtract one from the number in the name.
        const contraNum = laterality === 's' ? parseInt(nameProps[2]) + 1 : parseInt(nameProps[2]) - 1
        // At least the starting part of the names should match. First try an exact match.
        const contra = this._montage.channels.find((chan) => {
            return chan.name.toLowerCase() === `${nameProps[1]}${contraNum}${nameProps[3] ?? ''}`.toLowerCase()
        })
        if (contra) {
            // Cache the found channel for future reference.
            this._contralateralChan = contra as EegMontageChannelProperties
            Log.debug(`Found exact channel pair match for '${this.name}': '${this._contralateralChan.name}'.`, SCOPE)
            return this._contralateralChan
        }
        // If an exact match was not found, try a more fuzzy match.
        const contraFuzzy = this._montage.channels.find((chan) => {
            return chan.name.toLowerCase().startsWith(`${nameProps[1] + contraNum}`.toLowerCase())
        })
        if (contraFuzzy) {
            this._contralateralChan = contraFuzzy as EegMontageChannelProperties
            Log.debug(`Found fuzzy channel pair match for '${this.name}': '${this._contralateralChan.name}'.`, SCOPE)
            return this._contralateralChan
        }
        // No contralateral channel found.
        return null
    }
}
