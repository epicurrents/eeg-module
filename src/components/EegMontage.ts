/**
 * Epicurrents EEG montage.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalMontage } from '@epicurrents/core'
import { mapMontageChannels } from '@epicurrents/core/dist/util'
import type {
    BiosignalMontage,
    BiosignalMontageTemplate,
    BiosignalSetup,
    ConfigBiosignalMontage,
    ConfigMapChannels,
    MemoryManager,
} from '@epicurrents/core/dist/types'
import EegMontageChannel from './EegMontageChannel'
import type { EegResource } from '#types'
import Log from 'scoped-event-log'

const SCOPE = 'EegMontage'
export default class EegMontage extends GenericBiosignalMontage implements BiosignalMontage {

    constructor (
        name: string,
        recording: EegResource,
        setup: BiosignalSetup,
        template?: BiosignalMontageTemplate,
        manager?: MemoryManager,
        config?: ConfigBiosignalMontage,
    ) {
        // Default to the eeg-montage worker.
        config = Object.assign({ overrideWorker: 'eeg-montage' }, config)
        super(name, recording, setup, template, manager, config)
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////

    mapChannels (config?: ConfigMapChannels) {
        if (!window.__EPICURRENTS__?.RUNTIME) {
            Log.error(`Reference to main application was not found!`, SCOPE)
            return []
        }
        const channelConfig = Object.assign(
                                {},
                                window.__EPICURRENTS__.RUNTIME.SETTINGS.modules.eeg,
                                config ? config : this._config
                              ) as ConfigMapChannels
        const chanProps = mapMontageChannels(this._setup, channelConfig)
        this.channels = chanProps.map((chan) => {
            return new EegMontageChannel(
                this,
                chan.name,
                chan.label,
                chan.modality,
                chan.active,
                chan.reference,
                chan.averaged,
                chan.samplingRate,
                chan.unit,
                chan.visible,
                chan
            )
        })
        return this.channels
    }
}
