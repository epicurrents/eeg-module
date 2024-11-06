/**
 * Epicurrents EEG montage.
 * @package    epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalMontage } from '@epicurrents/core'
import { mapMontageChannels } from '@epicurrents/core/dist/util'
import {
    type BiosignalMontage,
    type BiosignalMontageTemplate,
    type BiosignalSetup,
    type ConfigBiosignalMontage,
    type ConfigMapChannels,
    type MemoryManager,
} from '@epicurrents/core/dist/types'
import EegMontageChannel from './EegMontageChannel'
import { type EegResource } from '../types'
import Log from 'scoped-event-log'

const SCOPE = 'EegMontage'

const DEFAULTS = {} as { [std: string]: { [montage: string]: BiosignalMontageTemplate } }
// Build default montages.
DEFAULTS['10-20'] = {}
import DEFAULT_1020_AVG from '../config/defaults/10-20/montages/avg.json'
DEFAULTS['10-20']['avg'] = DEFAULT_1020_AVG as BiosignalMontageTemplate
import DEFAULT_1020_DBN from '../config/defaults/10-20/montages/dbn.json'
DEFAULTS['10-20']['dbn'] = DEFAULT_1020_DBN as BiosignalMontageTemplate
import DEFAULT_1020_LPL from '../config/defaults/10-20/montages/lpl.json'
DEFAULTS['10-20']['lpl'] = DEFAULT_1020_LPL as BiosignalMontageTemplate
import DEFAULT_1020_REC from '../config/defaults/10-20/montages/rec.json'
DEFAULTS['10-20']['rec'] = DEFAULT_1020_REC as BiosignalMontageTemplate
import DEFAULT_1020_TRV from '../config/defaults/10-20/montages/trv.json'
DEFAULTS['10-20']['trv'] = DEFAULT_1020_TRV as BiosignalMontageTemplate

export default class EegMontage extends GenericBiosignalMontage implements BiosignalMontage {

    constructor (
        name: string,
        recording: EegResource,
        setup: BiosignalSetup,
        manager?: MemoryManager,
        config?: ConfigBiosignalMontage,
    ) {
        super(name, recording, setup, manager, config)
        // Save default config.
        if (name.startsWith('default:')) {
            const confParams = name.split(':')
            // Check that configuration is valid.
            if (
                confParams.length !== 3 ||
                !Object.hasOwn(DEFAULTS, confParams[1]) ||
                !Object.hasOwn(DEFAULTS[confParams[1]], confParams[2])
            ) {
                Log.error(`Given default configuration ${name} is not supported.`, SCOPE)
            } else {
                this.setupChannels(DEFAULTS[confParams[1]][confParams[2]])
            }
        }
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
            // We need to copy some properties to optional params.
            const optionalParams = {
                amplification: chan.amplification,
                displayPolarity: chan.displayPolarity,
                laterality: chan.laterality,
                offset: chan.offset,
                sampleCount: chan.sampleCount,
                sensistivity: chan.sensitivity,
            }
            return new EegMontageChannel(
                chan.name,
                chan.label,
                chan.type as string,
                chan.active,
                chan.reference,
                chan.averaged,
                chan.samplingRate,
                chan.unit,
                chan.visible,
                optionalParams
            )
        })
        return this.channels
    }
}
