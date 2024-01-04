/**
 * EpiCurrents EEG module.
 * @package    @epicurrents/eeg-module
 * @copyright  2023 Sampsa Lohi
 * @license    Apache-2.0
 */

import { logInvalidMutation } from '@epicurrents/core/dist/runtime'
import {
    type DataResource,
    type RuntimeResourceModule,
    type SafeObject,
    type StateManager,
} from '@epicurrents/core/dist/types'
import { type EegResource } from '../types'

const SCOPE = 'eeg-runtime-module'

const EEG: SafeObject & RuntimeResourceModule = {
    __proto__: null,
    moduleName: {
        code: 'eeg',
        full: 'Electroencephalography',
        short: 'EEG',
    },
    setPropertyValue (property: string, value: unknown, resource?: DataResource, state?: StateManager) {
        // EEG-specific property mutations
        const activeRes = resource
                          ? resource as EegResource
                          : state
                            ? state.APP.activeDataset?.activeResources[0] as EegResource
                            : null
        if (!activeRes) {
            return
        }
        if (property === 'active-montage') {
            if (
                typeof value !== 'string' &&
                typeof value !== 'number' &&
                value !== null
            ) {
                logInvalidMutation(property, value, SCOPE)
                return
            }
            if (activeRes.activeMontage !== undefined) {
                activeRes.setActiveMontage(value)
            }
        } else if (property === 'highpass-filter') {
            if (typeof value !== 'number' || value < 0) {
                logInvalidMutation(property, value, SCOPE, "Value must be a positive number.")
                return
            }
            if (activeRes.filters?.highpass !== undefined) {
                activeRes.setHighpassFilter(value)
            }
        } else if (property === 'lowpass-filter') {
            if (typeof value !== 'number' || value < 0) {
                logInvalidMutation(property, value, SCOPE, "Value must be a positive number.")
                return
            }
            if (activeRes.filters?.lowpass !== undefined) {
                activeRes.setLowpassFilter(value)
            }
        } else if (property === 'notch-filter') {
            if (typeof value !== 'number' || value < 0) {
                logInvalidMutation(property, value, SCOPE, "Value must be a positive number.")
                return
            }
            if (activeRes.filters?.notch !== undefined) {
                activeRes.setNotchFilter(value)
            }
        } else if (property === 'sensitivity') {
            if (typeof value !== 'number' || value <= 0) {
                logInvalidMutation(property, value, SCOPE, "Value must be a positive number.")
                return
            }
            if (activeRes.sensitivity !== undefined) {
                activeRes.sensitivity = value
            }
        }
    },
}
export default EEG
