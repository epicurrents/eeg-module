/**
 * EEG cascade montage. Thin wrapper around `GenericBiosignalCascadeMontage` that pins the EEG montage worker and
 * constructs each row as an `EegMontageChannel`. All cascade math (slicing, page-step / timebase overrides, source
 * resolution) lives in the base class.
 *
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalCascadeMontage } from '@epicurrents/core'
import type {
    BiosignalSetup,
    ConfigBiosignalMontage,
    MemoryManager,
    MontageChannel,
    SetupChannel,
} from '@epicurrents/core/dist/types'
import EegMontageChannel from './EegMontageChannel'
import type { EegResource } from '#types'

export default class EegCascadeMontage extends GenericBiosignalCascadeMontage {

    constructor (
        name: string,
        recording: EegResource,
        setup: BiosignalSetup,
        sourceLabel: string,
        rowCount: number,
        pageLength: number,
        manager?: MemoryManager,
        config?: ConfigBiosignalMontage,
    ) {
        // Default to the eeg-montage worker (matches EegMontage).
        config = Object.assign({ overrideWorker: 'eeg-montage' }, config)
        super(name, recording, setup, sourceLabel, rowCount, pageLength, manager, config)
    }

    ///////////////////////////////////////////////////
    //                   METHODS                     //
    ///////////////////////////////////////////////////

    protected _createChannel (src: SetupChannel, rowIndex: number): MontageChannel {
        return new EegMontageChannel(
            this,
            `${src.name}_row${rowIndex + 1}`,
            `${src.label} ${rowIndex + 1}`,
            src.modality,
            src.index,
            [],
            false,
            src.samplingRate ?? 0,
            src.unit,
            true,
        )
    }
}
