/**
 * Biosignal channel mock.
 */

import { GenericBiosignalChannel } from '@epicurrents/core'

export class EegChannel extends GenericBiosignalChannel {

    constructor (
        name: string,
        label: string,
        averaged: boolean,
        samplingRate: number,
        visible: boolean
    ) {
        super(name, label, "eeg", averaged, samplingRate, "uV", visible)
    }

}
