/**
 * Epicurrents EEG scalp topography.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import EegSurfaceFieldMap from './EegSurfaceFieldMap'
import EegTopogram from './EegTopogram'
import { DEFAULT_DIVERGING_RAMP, rampFromHex, rampFromSettingsColors, sampleRamp } from './colorRamp'
import { getElectrodePosition, resolveMontageElectrodes } from './electrodes'

export {
    DEFAULT_DIVERGING_RAMP,
    EegSurfaceFieldMap,
    EegTopogram,
    getElectrodePosition,
    rampFromHex,
    rampFromSettingsColors,
    resolveMontageElectrodes,
    sampleRamp,
}
