/**
 * Epicurrents EEG event.
 * @package    epicurrents/eeg-module
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import { GenericBiosignalEvent } from '@epicurrents/core'
import type {
    AnnotationEventTemplate,
    BiosignalAnnotationEventOptions,
    CodedEventProperties,
    SettingsColor,
} from '@epicurrents/core/dist/types'
import type { EegResourceEvent } from '#types'
import { objectToReadOnly } from '@epicurrents/core/dist/util'
import { Log } from 'scoped-event-log'

const SCOPE = 'EegEvent'

export default class EegEvent extends GenericBiosignalEvent implements EegResourceEvent {
    /**
     * Standardized coded events with possible ISO/IEEE and/or DICOM code values.
     * Source: https://dicom.nema.org/medical/dicom/2020d/output/chtml/part16/sect_CID_3035.html
     */
    static get CODED_EVENTS () {
        return objectToReadOnly({
            /** Activation procedures. */
            ACTIVATION: {
                EYES_CLOSED: {
                    code: 'EEG_ACT_EC',
                    name: 'Eyes closed',
                    standardCodes: {
                        dicom: 'MDC/2:24320',
                        ieee: 'MDC_EOG_EYE_MVMT_CLOSING',
                    },
                },
                EYES_OPEN: {
                    code: 'EEG_ACT_EO',
                    name: 'Eyes open',
                    standardCodes: {
                        dicom: 'MDC/2:24328',
                        ieee: 'MDC_EOG_EYE_MVMT_OPENING',
                    },
                },
                HYPERVENTILATION: {
                    code: 'EEG_ACT_HV',
                    name: 'Hyperventilation',
                    standardCodes: {
                        dicom: 'SCT/68978004',
                    },
                },
                HYPERVENTILATION_END: {
                    code: 'EEG_ACT_HV_END',
                    name: 'End of hyperventilation',
                    standardCodes: {
                        dicom: 'DCM/130414',
                    },
                },
                HYPERVENTILATION_START: {
                    code: 'EEG_ACT_HV_START',
                    name: 'Start of hyperventilation',
                    standardCodes: {
                        dicom: 'DCM/130413',
                    },
                },
                PHOTIC_STIMULATION: {
                    code: 'EEG_ACT_PHOTIC',
                    name: 'Photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_1HZ: {
                    code: 'EEG_ACT_PHOTIC_1HZ',
                    name: '1 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_2HZ: {
                    code: 'EEG_ACT_PHOTIC_2HZ',
                    name: '2 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_3HZ: {
                    code: 'EEG_ACT_PHOTIC_3HZ',
                    name: '3 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_4HZ: {
                    code: 'EEG_ACT_PHOTIC_4HZ',
                    name: '4 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_5HZ: {
                    code: 'EEG_ACT_PHOTIC_5HZ',
                    name: '5 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_6HZ: {
                    code: 'EEG_ACT_PHOTIC_6HZ',
                    name: '6 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_7HZ: {
                    code: 'EEG_ACT_PHOTIC_7HZ',
                    name: '7 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_8HZ: {
                    code: 'EEG_ACT_PHOTIC_8HZ',
                    name: '8 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_9HZ: {
                    code: 'EEG_ACT_PHOTIC_9HZ',
                    name: '9 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_10HZ: {
                    code: 'EEG_ACT_PHOTIC_10HZ',
                    name: '10 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_12HZ: {
                    code: 'EEG_ACT_PHOTIC_12HZ',
                    name: '12 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_15HZ: {
                    code: 'EEG_ACT_PHOTIC_15HZ',
                    name: '15 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_18HZ: {
                    code: 'EEG_ACT_PHOTIC_18HZ',
                    name: '18 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_20HZ: {
                    code: 'EEG_ACT_PHOTIC_20HZ',
                    name: '20 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_25HZ: {
                    code: 'EEG_ACT_PHOTIC_25HZ',
                    name: '25 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_30HZ: {
                    code: 'EEG_ACT_PHOTIC_30HZ',
                    name: '30 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_40HZ: {
                    code: 'EEG_ACT_PHOTIC_40HZ',
                    name: '40 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_50HZ: {
                    code: 'EEG_ACT_PHOTIC_50HZ',
                    name: '50 Hz photic stimulation',
                    standardCodes: {
                    },
                },
                PHOTIC_STIMULATION_60HZ: {
                    code: 'EEG_ACT_PHOTIC_60HZ',
                    name: '60 Hz photic stimulation',
                    standardCodes: {
                    },
                },
            } as Record<string, CodedEventProperties>,
            /** Artifacts and non-cerebral events. */
            ARTIFACT: {
                CHEWING: {
                    code: 'EEG_ART_CHEWING',
                    name: 'Chewing artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24264',
                        ieee: 'MDC_EEG_ARTIF_SWALLOW_ETC',
                    },
                },
                EKG: {
                    code: 'EEG_ART_EKG',
                    name: 'EKG artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24240',
                        ieee: 'MDC_EEG_ARTIF_EKG',
                    },
                },
                ELECTRODE: {
                    code: 'EEG_ART_ELECTRODE',
                    name: 'Electrode artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24208',
                        ieee: 'MDC_EEG_ARTIF_ELECTRODE_INSTRUM',
                    },
                },
                EYE_BLINK: {
                    code: 'EEG_ART_EYE_BLINK',
                    name: 'Eye blink',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24280',
                        ieee: 'MDC_EOG_EYE_MVMT_BLINK',
                    },
                },
                EYE_MOVEMENT: {
                    code: 'EEG_ART_EYE_MOVEMENT',
                    name: 'Eye movement',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24272',
                        ieee: 'MDC_EOG_EYE_MVMT_SACCADE',
                    },
                },
                EXTERNAL: {
                    code: 'EEG_ART_EXTERNAL',
                    name: 'External artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24272',
                        ieee: 'MDC_EEG_ARTIF_EXT_INTERF',
                    },
                },
                EXTRAOCULAR_MUSCLE: {
                    code: 'EEG_ART_EXTRAOC_MUSCLE',
                    name: 'Extraocular muscle artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24160',
                        ieee: 'MDC_EEG_EXT_EXTRA_OCUL_MUSCL_ACTIV',
                    },
                },
                GENERIC: {
                    code: 'EEG_ART',
                    name: 'Artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24200',
                        ieee: 'MDC_EEG_ARTIF',
                    },
                },
                GLOSSOKINETIC: {
                    code: 'EEG_ART_GLOSSOKIN',
                    name: 'Glossokinetic artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24256',
                        ieee: 'MDC_EEG_ARTIF_GLOSSOKINETIC',
                    },
                },
                HEMIFACIAL_SPASM: {
                    code: 'EEG_ART_HEMIFACIAL_SPASM',
                    name: 'Hemifacial spasm',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24152',
                        ieee: 'MDC_EEG_EXT_HEMIFACIAL_SPASM',
                    },
                },
                MOVEMENT: {
                    code: 'EEG_ART_MVMT',
                    name: 'Movement artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24216',
                        ieee: 'MDC_EEG_ARTIF_MVMT',
                    },
                },
                MYOCLONIC: {
                    code: 'EEG_ART_MYOCLONIC',
                    name: 'Myoclonic artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24176',
                        ieee: 'MDC_EEG_EXT_ACTIV_MYOCLONIC',
                    },
                },
                MYOGENIC: {
                    code: 'EEG_ART_MYOGENIC',
                    name: 'Myogenic artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24120',
                        ieee: 'MDC_EEG_EXT_ACTIV_MYOGENIC',
                    },
                },
                MYOKYMIA: {
                    code: 'EEG_ART_MYOKYMIA',
                    name: 'Myokymic artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24136',
                        ieee: 'MDC_EEG_EXT_MYOKYMIA',
                    },
                },
                NYSTAGMUS: {
                    code: 'EEG_ART_NYSTAGMUS',
                    name: 'Nystagmoid eye movement',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24056',
                        ieee: 'MDC_EEG_EXT_CRTX_EYE_MVMT_NYSTAG_MULT',
                    },
                },
                PULSE: {
                    code: 'EEG_ART_PULSE',
                    name: 'Pulse artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24232',
                        ieee: 'MDC_EEG_ARTIF_PULSE',
                    },
                },
                RESPIRATORY: {
                    code: 'EEG_ART_RESP',
                    name: 'Respiratory artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24248',
                        ieee: 'MDC_EEG_ARTIF_RESP',
                    },
                },
                SLOW_EYE_MOVEMENT: {
                    code: 'EEG_ART_SLOW_EYE_MVMT',
                    name: 'Slow eye movement',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24064',
                        ieee: 'MDC_EEG_EXT_CRTX_EYE_MVMT_NYSTAG_MULT',
                    },
                },
                SWALLOWING: {
                    code: 'EEG_ART_SWALLOWING',
                    name: 'Swallowing artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24264',
                        ieee: 'MDC_EEG_ARTIF_SWALLOW_ETC',
                    },
                },
                SWEATING: {
                    code: 'EEG_ART_SWEAT',
                    name: 'Sweating artifact',
                    significance: 'artifact',
                    standardCodes: {
                        dicom: 'MDC/2:24224',
                        ieee: 'MDC_EEG_ARTIF_SWEAT_OR_GALV',
                    },
                },
            } as Record<string, CodedEventProperties>,
            /** Background activities. */
            BACKGROUND: {
                ACTIVITY: {
                    code: 'EEG_BKG_ACTIVITY',
                    name: 'Background activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23560',
                        ieee: 'MDC_EEG_BKGD_CRTX',
                    },
                },
                ALPHA: {
                    code: 'EEG_BKG_ALPHA',
                    name: 'Background alpha activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23592',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_ALPHA',
                    },
                },
                BETA: {
                    code: 'EEG_BKG_BETA',
                    name: 'Background beta activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23568',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_BETA',
                    },
                },
                BURST_SUPPRESSION: {
                    code: 'EEG_BKG_BURST_SUPP',
                    name: 'Burst suppression',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23952',
                        ieee: 'MDC_EEG_PAROX_CRTX_BURST_SUPPRN',
                    },
                },
                DELTA: {
                    code: 'EEG_BKG_DELTA',
                    name: 'Background delta activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23624',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_DELTA',
                    },
                },
                DELTA_ARRHYTHMIC: {
                    code: 'EEG_BKG_DELTA_ARRHY',
                    name: 'Arrhythmic delta activity',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23640',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_ARRHY_DELTA',
                    },
                },
                DELTA_BISYNCHRONOUS: {
                    code: 'EEG_BKG_DELTA_BISYNC',
                    name: 'Bisynchronous delta activity',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23632',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_DELTA_BISYNC',
                    },
                },
                DROWSY: {
                    code: 'EEG_BKG_DROWSY',
                    name: 'Drowsy',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'SCT/271782001',
                    },
                },
                GAMMA: {
                    code: 'EEG_BKG_GAMMA',
                    name: 'Background gamma activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23584',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_GAMMA',
                    },
                },
                SIGMA: {
                    code: 'EEG_BKG_SIGMA',
                    name: 'Background sigma activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23576',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_SIGMA',
                    },
                },
                SLOW_FUSED: {
                    code: 'EEG_BKG_SLOW_FUSED',
                    name: 'Fused slow activity',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23648',
                        ieee: 'MDC_EEG_BKGD_CRTX_TRANS_FUSED_SLOW',
                    },
                },
                THETA: {
                    code: 'EEG_BKG_THETA',
                    name: 'Background theta activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23608',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_THETA',
                    },
                },
                THETA_BISYNCHRONOUS: {
                    code: 'EEG_BKG_THETA_BISYNC',
                    name: 'Bisynchronous theta activity',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23616',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_THETA_BISYNC',
                    },
                },
            } as Record<string, CodedEventProperties>,
            /** Epileptiform events. */
            EPILEPTIFORM: {
                DISCHARGE: {
                    code: 'EEG_EPI_DISCHARGE',
                    name: 'Epileptiform discharge',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23888',
                        ieee: 'MDC_EEG_PAROX_CRTX_DISCHG',
                    },
                },
                POLYSPIKE: {
                    code: 'EEG_EPI_POLYSPIKE',
                    name: 'Polysike',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23912',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK_MULT',
                    },
                },
                SHARP: {
                    code: 'EEG_EPI_SHARP',
                    name: 'Sharp wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23896',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_SHARP',
                    },
                },
                SHARP_AND_SLOW: {
                    code: 'EEG_EPI_SHARP_SLOW',
                    name: 'Sharp-and-slow wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23936',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_CMPLX_SHARP_SLOW',
                    },
                },
                SPIKE: {
                    code: 'EEG_EPI_SPIKE',
                    name: 'Spike',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23904',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK',
                    },
                },
                SPIKE_AND_WAVE: {
                    code: 'EEG_EPI_SPIKE_WAVE',
                    name: 'Spike-and-wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23920',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK_AND_WV_CMPLX',
                    },
                },
                SPIKE_AND_WAVE_ATYPICAL: {
                    code: 'EEG_EPI_SPIKE_WAVE_ATYP',
                    name: 'Atypical spike-and-wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23928',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK_AND_WV_CMPLX_ATYP',
                    },
                },
            } as Record<string, CodedEventProperties>,
            /** Other events. */
            OTHER: {} as Record<string, CodedEventProperties>,
            /** Paroxysmal (transient) patterns. */
            PAROXYSM: {
                FOLD: {
                    code: 'EEG_TRN_FOLD',
                    description: 'Female/occipital/low-amplitude/drowsy phantom spike-and-wave pattern.',
                    name: 'FOLD phantom spike-and-wave',
                    significance: 'uncertain',
                    standardCodes: {
                        dicom: 'MDC/2:23864',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK_AND_WV_PHANTOM',
                    },
                },
                FOURTEEN_AND_SIX: {
                    code: 'EEG_TRN_14_6',
                    name: '14/6 burst',
                    significance: 'uncertain',
                    standardCodes: {
                        dicom: 'MDC/2:23872',
                        ieee: 'MDC_EEG_PAROX_CRTX_BURST_POS_14_AND_6HZ',
                    },
                },
                MIDLINE_THETA: {
                    code: 'EEG_TRN_MID_THETA',
                    description: 'Also known as Ciganek rhythm.',
                    name: 'Midline theta (of drowsiness)',
                    significance: 'normal',
                },
                MU_RHYTHM: {
                    code: 'EEG_TRN_MU',
                    name: 'Mu rhythm',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23600',
                        ieee: 'MDC_EEG_BKGD_CRTX_ACTIV_MU',
                    },
                },
                PERIODIC_COMPLEX: {
                    code: 'EEG_TRN_PERIODIC_COMPLEX',
                    name: 'Periodic complexes',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:24000',
                        ieee: 'MDC_EEG_PAROX_CRTX_CMPLX_MULT_PERI',
                    },
                },
                PERIODIC_EPILEPTIFORM: {
                    code: 'EEG_TRN_PERIODIC_EPI',
                    name: 'Periodic epileptiform discharges',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23992',
                        ieee: 'MDC_EEG_PAROX_CRTX_DISCHG_EPILEP_MULT_PERI',
                    },
                },
                PERIODIC_TRIPHASIC: {
                    code: 'EEG_TRN_PERIODIC_TRIPHASIC',
                    name: 'Periodic triphasic waves',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23984',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_TRIPHAS_MULT_PERI',
                    },
                },
                PERIODIC_SHARP: {
                    code: 'EEG_TRN_PERIODIC_SHARP',
                    name: 'Periodic sharp waves',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:24016',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_MULT_SHARP_PERI',
                    },
                },
                PHANTOM: {
                    code: 'EEG_TRN_PHANTOM_SPIKE',
                    name: 'Phantom spike-and-wave',
                    significance: 'uncertain',
                    standardCodes: {
                        dicom: 'MDC/2:23864',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK_AND_WV_PHANTOM',
                    },
                },
                RMTD: {
                    code: 'EEG_TRN_RMTD',
                    name: 'Rhythmic mid-temporal theta of drowsiness',
                    significance: 'normal',
                },
                WHAM: {
                    code: 'EEG_TRN_WHAM',
                    description: 'Wake/high-amplitude/anterior/male phantom spike-and-wave pattern.',
                    name: 'WHAM phantom spike-and-wave',
                    significance: 'uncertain',
                    standardCodes: {
                        dicom: 'MDC/2:23864',
                        ieee: 'MDC_EEG_PAROX_CRTX_SPK_AND_WV_PHANTOM',
                    },
                },
            } as Record<string, CodedEventProperties>,
            /** Sleep-related events. */
            SLEEP: {
                ACTIVITY: {
                    code: 'EEG_SLP_ACTIVITY',
                    name: 'Sleep activity',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23736',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_ACTIV',
                    },
                },
                ALPHA_DELTA: {
                    code: 'EEG_SLP_ALPHA_DELTA',
                    name: 'Alpha-delta sleep',
                    significance: 'uncertain',
                    standardCodes: {
                        dicom: 'MDC/2:23728',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_STG_ALPHA_DELTA',
                    },
                },
                AROUSAL: {
                    code: 'EEG_SLP_AROUSAL',
                    name: 'Arousal',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23800',
                        ieee: 'MDC_EEG_CLS_CRTX_AROUSAL',
                    },
                },
                AWAKENING: {
                    code: 'EEG_SLP_AWAKENING',
                    name: 'Awakening',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23808',
                        ieee: 'MDC_EEG_CLS_CRTX_AWAKENING',
                    },
                },
                KCOMPLEX: {
                    code: 'EEG_SLP_KCOMPLEX',
                    name: 'K-complex',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23768',
                        ieee: 'MDC_EEG_CLS_CRTX_CMPLX_K',
                    },
                },
                NREM1: {
                    code: 'EEG_SLP_NREM1',
                    name: 'NREM 1',
                    standardCodes: {
                        dicom: 'MDC/2:23696',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_STG_I',
                    },
                },
                NREM2: {
                    code: 'EEG_SLP_NREM2',
                    name: 'NREM 2',
                    standardCodes: {
                        dicom: 'MDC/2:23704',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_STG_II',
                    },
                },
                NREM3: {
                    code: 'EEG_SLP_NREM3',
                    name: 'NREM 3',
                    standardCodes: {
                        dicom: 'MDC/2:23712',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_STG_III',
                    },
                },
                POSTS: {
                    code: 'EEG_SLP_POSTS',
                    name: 'Positive occipital sharp transient of sleep',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23776',
                        ieee: 'MDC_EEG_CLS_CRTX_POSTOCCIP_TRANS_SHARP',
                    },
                },
                REM: {
                    code: 'EEG_SLP_REM',
                    name: 'REM sleep',
                    standardCodes: {
                        dicom: 'MDC/2:23680',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_REM',
                    },
                },
                SAWTOOTH_WAVE: {
                    code: 'EEG_SLP_STWAVE',
                    name: 'Sawtooth wave',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23784',
                        ieee: 'MDC_EEG_CLS_CRTX_WV_SAW',
                    },
                },
                SPINDLE: {
                    code: 'EEG_SLP_SPINDLE',
                    name: 'Sleep spindle',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23744',
                        ieee: 'MDC_EEG_CLS_CRTX_SLP_SPINDLE',
                    },
                },
                VERTEX_WAVE: {
                    code: 'EEG_SLP_VWAVE',
                    name: 'Vertex sharp wave',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23752',
                        ieee: 'MDC_EEG_CLS_CRTX_WV_V',
                    },
                },
                WAKE: {
                    code: 'EEG_SLP_WAKE',
                    name: 'Wake',
                    standardCodes: {
                        dicom: 'MDC/2:23672',
                        ieee: 'MDC_EEG_CLS_CRTX_WAKE_STG',
                    },
                },
            } as Record<string, CodedEventProperties>,
            /** Transient waveforms. */
            TRANSIENT: {
                DELTA_BRUSH: {
                    code: 'EEG_TRN_DELTA_BRUSH',
                    name: 'Delta brush',
                    significance: 'abnormal',
                },
                LAMBDA_WAVE: {
                    code: 'EEG_TRN_LAMBDA',
                    name: 'Lambda wave',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23880',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_LAMBDA',
                    },
                },
                SHARPLY_COUNTERED: {
                    code: 'EEG_TRN_SHARP',
                    name: 'Sharply countered wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23824',
                        ieee: 'MDC_EEG_PAROX_CRTX_TRANS_SHARP',
                    },
                },
                SLOW_WAVE: {
                    code: 'EEG_TRN_SLOW_WAVE',
                    name: 'Slow wave',
                    significance: 'abnormal',
                },
                TRIPHASIC_WAVE: {
                    code: 'EEG_TRN_TRIPHASIC',
                    name: 'Triphasic wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23856',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_TRIPHAS',
                    },
                },
                WICKET: {
                    code: 'EEG_TRN_WICKET',
                    name: 'Wicket wave',
                    significance: 'normal',
                    standardCodes: {
                        dicom: 'MDC/2:23832',
                        ieee: 'MDC_EEG_PAROX_CRTX_WICKET',
                    },
                },
                ZETA_WAVE: {
                    code: 'EEG_TRN_ZETA',
                    name: 'Zeta wave',
                    significance: 'abnormal',
                    standardCodes: {
                        dicom: 'MDC/2:23848',
                        ieee: 'MDC_EEG_PAROX_CRTX_WV_ZETA',
                    },
                },
            } as Record<string, CodedEventProperties>,
        })
    }

    /**
     * Add standardized event codes to existing coded events.
     * @param standard - The external standard the codes follow.
     * @param codes - The codes to add following `CODED_EVENTS` structure.
     */
    public static readonly addStandardEventCodes = (
        standard: string,
        codes: Record<string, Record<string, number | string>>
    ) => {
        for (const [category, events] of Object.entries(codes)) {
            if (!Object.hasOwn(EegEvent.CODED_EVENTS, category) && Object.keys(events).length) {
                Log.warn(
                    `The category '${
                        category
                    }' does not exist in CODED_EVENTS. Skipping adding standard codes for this category.`,
                    SCOPE
                )
                continue
            }
            const categoryEvents = EegEvent.CODED_EVENTS[category as keyof typeof EegEvent.CODED_EVENTS]
            for (const [eventName, eventCode] of Object.entries(events)) {
                const event = categoryEvents[eventName]
                if (event) {
                    if (!event.standardCodes) {
                        Object.assign(event, { standardCodes: {} })
                    } else if (Object.hasOwn(event.standardCodes!, standard)) {
                        Log.warn(
                            `The event '${
                                eventName
                            }' in category '${
                                category
                            }' already has a standard code for '${
                                standard
                            }'.`,
                            SCOPE
                        )
                        continue
                    }
                    Object.assign(event.standardCodes!, { [standard]: eventCode })
                } else {
                    Log.warn(
                        `The event name '${
                            eventName
                        }' does not exist in category '${
                            category
                        }' of CODED_EVENTS. Skipping adding standard code for this event.`,
                        SCOPE
                    )
                }
            }
        }
    }
    /**
     * Extend the given event category with new events.
     * @param category - The event category to extend.
     * @param events - The events to add.
     * @throws Error if an event key already exists in the category.
     */
    public static readonly extendEvents = (category: string, events: Record<string, CodedEventProperties>) => {
        for (const eventKey of Object.keys(events)) {
            if (Object.hasOwn(EegEvent.CODED_EVENTS[category as keyof typeof EegEvent.CODED_EVENTS], eventKey)) {
                Log.error(
                    SCOPE,
                    `EegEvent.extendEvents: Mutating the existing event '${
                        eventKey
                    }' in category '${
                        category
                    }' is not allowed.`
                )
                throw new Error(
                    `EegEvent.extendEvents: Event key '${eventKey}' already exists in category '${category}'.`
                )
            }
        }
        // CODED_EVENTS is a safe object so we can assign properties directly.
        Object.assign(EegEvent.CODED_EVENTS[category as keyof typeof EegEvent.CODED_EVENTS], events)
    }
    /**
     * Create a new EEG event from a template.
     * @param tpl - The annotation event template.
     * @returns A new EegEvent instance.
     */
    public static fromTemplate (tpl: AnnotationEventTemplate) {
        return new EegEvent(
            tpl.start, tpl.duration, tpl.label || '',
            {
                annotator: tpl.annotator || undefined,
                background: tpl.background || undefined,
                channels: tpl.channels || undefined,
                class: tpl.class || undefined,
                color: tpl.color as SettingsColor || undefined,
                codes: tpl.codes || undefined,
                label: tpl.label || undefined,
                opacity: tpl.opacity || undefined,
                priority: tpl.priority || undefined,
                text: tpl.text || undefined,
                visible: tpl.visible || undefined,
            }
        )
    }
    /**
     * Get a standardized EEG event by its code.
     * @param code - Event code.
     * @param standard - Possible external standard the code follows ('dicom' or 'ieee').
     * @returns The matching EEG coded event properties or null if not found.
     */
    public static getEventForCode (code: string, standard?: 'dicom' | 'ieee'): CodedEventProperties | null {
        for (const categoryKey of Object.keys(EegEvent.CODED_EVENTS)) {
            const category = EegEvent.CODED_EVENTS[categoryKey as keyof typeof EegEvent.CODED_EVENTS]
            for (const eventKey of Object.keys(category)) {
                const event = category[eventKey]
                if (event.code === code) {
                    return event
                }
                if (standard === 'dicom' && event.standardCodes?.dicom === code) {
                    return event
                }
                if (standard === 'ieee' && event.standardCodes?.ieee === code) {
                    return event
                }
            }
        }
        return null
    }
    /**
     * Get a standardized EEG event by its label.
     * @param label - Event label.
     * @param labelMatchers - Optional custom regular expressions to match labels to specific event codes.
     * @returns The matching EEG coded event properties or null if not found.
     */
    public static getEventForLabel (
        label: string,
        labelMatchers: Record<string, RegExp> = {}
    ): CodedEventProperties | null {
        for (const categoryKey of Object.keys(EegEvent.CODED_EVENTS)) {
            const category = EegEvent.CODED_EVENTS[categoryKey as keyof typeof EegEvent.CODED_EVENTS]
            for (const eventKey of Object.keys(category)) {
                const event = category[eventKey]
                const matcher = labelMatchers[event.code]
                if (matcher && matcher.test(label)) {
                    return event
                } else if (event.name.toLowerCase() === label.toLowerCase()) {
                    return event
                }
            }
        }
        return null
    }

    /**
     * Create a new EEG event.
     * @param start - Starting time of the event in seconds after recording start.
     * @param duration - Duration of the event in seconds (0 for instantaneous events).
     * @param label - Human-readable label for the event.
     * @param options - Optional event properties.
     */
    constructor (
        // Required properties:
        start: number, duration: number, label: string,
        // Optional properties:
        options?: BiosignalAnnotationEventOptions
    ) {
        super(SCOPE, start, duration, label, options)
    }
}
