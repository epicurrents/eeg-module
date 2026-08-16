import {
    EegAmplitudeIntegratedTrend,
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
import {
    DEFAULT_DIVERGING_RAMP,
    EegSurfaceFieldMap,
    EegTopogram,
    getElectrodePosition,
    rampFromHex,
    rampFromSettingsColors,
    resolveMontageElectrodes,
    sampleRamp,
} from './topography'
import runtime from './runtime'
import settings from './config'
import { resolveAeegDerivation } from './util/derivation'

const modality = 'eeg'

export {
    DEFAULT_DIVERGING_RAMP,
    EegAmplitudeIntegratedTrend,
    EegEvent,
    EegLabel,
    EegMontage,
    EegMontageChannel,
    EegRecording,
    EegService,
    EegSetup,
    EegSourceChannel,
    EegStudyLoader,
    EegSurfaceFieldMap,
    EegTopogram,
    EegVideo,
    getElectrodePosition,
    modality,
    rampFromHex,
    rampFromSettingsColors,
    resolveAeegDerivation,
    resolveMontageElectrodes,
    runtime,
    sampleRamp,
    settings,
}
