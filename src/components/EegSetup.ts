/**
 * Epicurrents EEG setup.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalSetup } from '@epicurrents/core'
import type { BiosignalChannel, ConfigBiosignalSetup } from '@epicurrents/core/types'

export default class EegSetup extends GenericBiosignalSetup {

    constructor (channels: BiosignalChannel[], config: ConfigBiosignalSetup) {
        super(config.name, channels, config)
    }

}
