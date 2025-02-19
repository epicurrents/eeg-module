/**
 * Epicurrents EEG setup.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalSetup } from '@epicurrents/core'
import { type BiosignalChannel, type ConfigBiosignalSetup } from '@epicurrents/core/dist/types'
import Log from 'scoped-event-log'

// Build default setups.
const DEFAULTS = {} as { [setup: string]: ConfigBiosignalSetup }
import DEFAULT_1020 from '../config/defaults/10-20/setup.json'
DEFAULTS['10-20'] = DEFAULT_1020 as ConfigBiosignalSetup

const SCOPE = 'EegSetup'

export default class EegSetup extends GenericBiosignalSetup {

    constructor (name: string, channels: BiosignalChannel[], config?: ConfigBiosignalSetup) {
        super(name, channels, config)
        if (!config && name.startsWith('default:')) {
            const setup = DEFAULTS[name.substring(8) as keyof typeof DEFAULTS]
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
