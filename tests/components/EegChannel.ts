/**
 * Biosignal channel mock.
 */

import { GenericBiosignalChannel } from "@epicurrents/core"

export class EegChannel extends GenericBiosignalChannel {

    constructor (
        name: string,
        label: string,
        active: number,
        reference: number[],
        averaged: boolean,
        samplingRate: number,
        visible: boolean
    ) {
        super(name, label, "eeg", active, reference, averaged, samplingRate, "uV", visible)
    }

}