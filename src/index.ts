import {
    EegEvent,
    EegLabel,
    EegMontage,
    EegMontageChannel,
    EegSetup,
    EegSourceChannel,
    EegVideo,
} from './components'
import EegRecording from './EegRecording'
import EegService from './service/EegService'
import EegStudyLoader from './loader/EegStudyLoader'
import runtime from './runtime'
import settings from './config'

const modality = 'eeg'

export {
    EegEvent,
    EegLabel,
    EegMontage,
    EegMontageChannel,
    EegRecording,
    EegService,
    EegSetup,
    EegSourceChannel,
    EegStudyLoader,
    EegVideo,
    modality,
    runtime,
    settings,
}
