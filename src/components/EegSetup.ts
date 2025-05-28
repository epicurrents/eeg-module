/**
 * Epicurrents EEG setup.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalSetup } from '@epicurrents/core'
import { type BiosignalChannel, type ConfigBiosignalSetup } from '@epicurrents/core/dist/types'
//import Log from 'scoped-event-log'

//const SCOPE = 'EegSetup'

export default class EegSetup extends GenericBiosignalSetup {

    constructor (channels: BiosignalChannel[], config: ConfigBiosignalSetup) {
        super(config.name, channels, config)
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////
}
