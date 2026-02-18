// Minimal type definitions used by the eeg-module tests.
export type AnnotationLabelTemplate = {
    value: any
    annotator?: string | null
    class?: string
    codes?: any
    label?: string
    priority?: number
    text?: string
    visible?: boolean
}

export type AnnotationEventTemplate = {
    start: number
    duration: number
    label?: string
    annotator?: string | null
    background?: boolean
    channels?: any
    class?: string
    color?: string
    codes?: any
    opacity?: number
    priority?: number
    text?: string
    visible?: boolean
}

export type AnnotationOptions = any
export type BiosignalAnnotationEventOptions = any
export type CodedEventProperties = {
    code?: string
    name?: string
    description?: string
    significance?: string
    standardCodes?: { dicom?: string, ieee?: string }
}
export type SettingsColor = string

// Generic placeholder types used throughout source — keep permissive for tests
export type BiosignalMontage = any
export type BiosignalMontageTemplate = any
export type BiosignalSetup = any
export type ConfigBiosignalMontage = any
export type ConfigMapChannels = any
export type MemoryManager = any
export type DerivedChannelProperties = any
export type BiosignalChannel = any
export type MontageChannel = any
export type BiosignalAnnotationEvent = any
export type BiosignalChannelTemplate = any
export type FileFormatImporter = any
export type FileFormatExporter = any
export type SafeObject = any
export type StudyContext = any
export type UrlAccessOptions = any

export type BiosignalResource = any
export type EegResource = any
export type SourceChannel = any

// Additional permissive aliases expected by the source
export type VideoAttachment = any
export type ConfigBiosignalSetup = any
export type ConfigStudyLoader = any
export type BiosignalConfig = any
export type DataResource = any

// Additional types referenced by EegService and others
export type BiosignalDataService = any
export type BiosignalHeaderRecord = any
export type SetupStudyResponse = any
export type SignalCacheResponse = any
export type WorkerResponse = any
export type VideoAttachment = any
export type EegResourceEvent = any


export default {}
