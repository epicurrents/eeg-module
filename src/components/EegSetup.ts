/**
 * EpiCurrents EEG setup.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalSetup } from "@epicurrents/core"
import { type BiosignalChannel, type ConfigBiosignalSetup } from "@epicurrents/core/dist/types"
import tenTwenty from "../config/default_setups/10-20.json"
import Log from "scoped-ts-log"

const SCOPE = 'EegSetup'

const DEFAULTS = {
    '10-20': tenTwenty as ConfigBiosignalSetup,
}

export default class EegSetup extends GenericBiosignalSetup {

    constructor (id: string, channels: BiosignalChannel[], config?: ConfigBiosignalSetup) {
        super(id, channels, config)
        if (config && id === 'default:10-20') {
            this.loadConfig(channels, DEFAULTS['10-20'])
        } else if (!config) {
            Log.error(`No configuration found, setup did not finish.`, SCOPE)
        }
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////
}
