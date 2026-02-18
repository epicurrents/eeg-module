// Minimal mocks for @epicurrents/core used in unit tests.
export class GenericBiosignalEvent {
    scope: string
    start: number
    duration: number
    label: string
    options: any
    constructor(scope: string, start: number, duration: number, label: string, options?: any) {
        this.scope = scope
        this.start = start
        this.duration = duration
        this.label = label
        this.options = options
    }
}

export class ResourceLabel {
    scope: string
    value: any
    options: any
    constructor(scope: string, value: any, options?: any) {
        this.scope = scope
        this.value = value
        this.options = options
    }
}

export class GenericBiosignalMontage {
    name: string
    recording: any
    _setup: any
    _config: any
    channels: any[] = []
    _isActive: boolean = false
    constructor(name: string, recording: any, setup: any, template?: any, manager?: any, config?: any) {
        this.name = name
        this.recording = recording
        this._setup = setup
        this._config = config || {}
    }
    setInterruptions() {}
    get isActive() { return this._isActive }
    set isActive(v: boolean) { this._isActive = v }
    getMainProperties() { return new Map() }
    async releaseBuffers() { return Promise.resolve() }
    async unload() { return Promise.resolve() }
    async setupServiceWithInputMutex(_props: any) { return true }
    setupServiceWithCache(_props: any) { return true }
}

export class GenericBiosignalHeader {
    recordingStartTime: number = 0
    dataUnitCount: number = 0
    dataUnitDuration: number = 1
    sampleRate: number = 256
    constructor(init: Partial<GenericBiosignalHeader> = {}) {
        Object.assign(this, init)
    }
}

export class GenericMontageChannel {
    montage: any
    name: string
    label: string
    modality: string
    active: any
    reference: any
    averaged: boolean
    samplingRate: number
    unit: string
    visible: boolean
    extra: any
    constructor(montage: any, name: string, label: string, modality: string, active: any, reference: any, averaged: boolean, samplingRate: number, unit: string, visible: boolean, extraProperties: any = {}) {
        this.montage = montage
        this.name = name
        this.label = label
        this.modality = modality
        this.active = active
        this.reference = reference
        this.averaged = averaged
        this.samplingRate = samplingRate
        this.unit = unit
        this.visible = visible
        this.extra = extraProperties
    }
}

export class GenericBiosignalSetup {
    name: string
    channels: any[]
    config: any
    constructor(name: string, channels: any[], config: any) {
        this.name = name
        this.channels = channels
        this.config = config
    }
}

export class GenericSourceChannel {
    name: string
    label: string
    modality: string
    index: number
    averaged: boolean
    samplingRate: number
    unit: string
    visible: boolean
    _laterality: string | undefined
    constructor(name: string, label: string, modality: string, index: number, averaged: boolean, samplingRate: number, unit: string, visible: boolean, extraProperties: any = {}) {
        this.name = name
        this.label = label
        this.modality = modality
        this.index = index
        this.averaged = averaged
        this.samplingRate = samplingRate
        this.unit = unit
        this.visible = visible
        this._laterality = undefined
    }
}

export class GenericBiosignalResource {
    name: string
    modality: string
    _channels: any[] = []
    _service: any = null
    _memoryManager: any = null
    _resources: any[] = []
    _events: any[] = []
    _labels: any[] = []
    _interruptions: Set<any> = new Set()
    id: string | number = -1
    state: string = 'new'
    errorReason: string | null = null
    source: any = null
    montages: any[] = []
    // Additional internal properties sometimes accessed by the EEG module
    _mutexProps: any = null
    _cacheProps: any = null
    _recordMontage: any = null
    _startTime: number = 0
    _dataDuration: number = 0
    _totalDuration: number = 0
    _isActive: boolean = false
    maxSampleCount: number = 0
    maxSamplingRate: number = 0
    _setup: any = null
    constructor(name: string, modality: string) {
        this.name = name
        this.modality = modality
    }
    addEventListener(_ev: any, _cb: any, _id?: any) { }
    dispatchEvent(_ev: any, _phase?: any) { }
    dispatchPropertyChangeEvent(_prop: string, _value: any, _old: any, _phase?: any) { }
    async setupMutex() { return {} }
    async setupCache() { return {} }
    async cacheSignals() { return true }
    _setPropertyValue(prop: string, value: any) { (this as any)[prop] = value }
    setMemoryManager(mgr: any) { this._memoryManager = mgr }
    get events() { return this._events }
    set events(e: any[]) { this._events = e }
    addEvents(...events: any[]) { this._events.push(...events) }
    addLabels(...labels: any[]) { this._labels.push(...labels) }
    async releaseBuffers(): Promise<boolean> { return true }
    async unload() { return Promise.resolve() }
    get isActive() { return this._isActive }
    set isActive(v: boolean) { this._isActive = v }
    getMainProperties() { return new Map() }
}

export class GenericBiosignalService {
    _worker: any
    _manager: any
    _recording: any
    isReady: boolean = false
    bufferRangeStart: number = -1
    constructor(recording: any, worker: any, manager?: any) {
        this._recording = recording
        this._worker = worker
        this._manager = manager
    }
    async handleMessage(message: any) {
        return true
    }
    async requestMemory(_size: number) { return true }
    async setupWorker(_headers: any, _source: any, _options?: any, _formatHeader?: any) { return Promise.resolve(0) }
    _commissionWorker(_name: string, _params: Map<string, unknown>) {
        return { promise: Promise.resolve(0) }
    }
}

export class BiosignalStudyLoader {
    _study: any = null
    _studyImporter: any = null
    _memoryManager: any = null
    _name: string
    _modalities: string[]
    _importer: any
    _resources: any[] = []
    constructor(name: string, modalities: string[], importer: any, exporter?: any) {
        this._name = name
        this._modalities = modalities
        this._importer = importer
    }
    async loadFromUrl(_fileUrl: string, _config?: any, preStudy?: any) {
        return preStudy || null
    }
    async getResource(_idx: number | string = -1): Promise<any|null> {
        return null
    }
}

export const BiosignalMutex = {
    SIGNAL_DATA_POS: 4
}

// util stubs
export const MB_BYTES = 1024*1024
export const INDEX_NOT_ASSIGNED = -1
export function calculateSignalOffsets() { return null }
export function secondsToTimeString(s: number) { return [s] }
export function timePartsToShortString(parts: any) { return 'short' }

export const AssetEvents = { ACTIVATE: 'activate', DEACTIVATE: 'deactivate' }
export const BiosignalResourceEvents = { SIGNAL_CACHING_COMPLETE: 'signal_caching_complete' }

export default {}
