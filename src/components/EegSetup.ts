/**
 * EpiCurrents EEG setup.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalSetup } from '@epicurrents/core'
import { type BiosignalChannel, type ConfigBiosignalSetup } from '@epicurrents/core/dist/types'
import config from '../config/defaults.json'
import Log from 'scoped-ts-log'

const DEFAULTS = {} as { [setup: string]: ConfigBiosignalSetup }
for (const name in config) {
    DEFAULTS[name] = (
        await import(`../config/defaults/${name}/setup.json`)
    ).default
}

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
