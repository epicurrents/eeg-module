/**
 * EpiCurrents EEG setup.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalSetup } from '@epicurrents/core'
import { type BiosignalChannel, type ConfigBiosignalSetup } from '@epicurrents/core/dist/types'
import Log from 'scoped-ts-log'

// Build default setups.
const DEFAULTS = {} as { [setup: string]: ConfigBiosignalSetup }
import DEFAULT_1020 from '../config/defaults/10-20/setup.json'
DEFAULTS['10-20'] = DEFAULT_1020 as ConfigBiosignalSetup

const SCOPE = 'EegSetup'

export default class EegSetup extends GenericBiosignalSetup {

    constructor (id: string, channels: BiosignalChannel[], config?: ConfigBiosignalSetup) {
        super(id, channels, config)
        if (!config && id.startsWith('default:')) {
            const setup = DEFAULTS[id.substring(8) as keyof typeof DEFAULTS]
            if (setup) {
                this.loadConfig(channels, setup)
            }
        } else if (!config) {
            Log.error(`No configuration found, setup did not finish.`, SCOPE)
        }
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////
}
