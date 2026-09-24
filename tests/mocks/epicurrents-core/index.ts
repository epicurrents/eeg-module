// Minimal mocks for @epicurrents/core used in unit tests.
// The vocabulary loaders are the real ones, reached through the core checkout beside this package: EegEvent stacks
// its table on the base one with them, and a stand-in would hide a mismatch between the two.
import { codedEventsFromVocabulary, mergeCodedEvents } from '../../../../core/src/assets/annotation/vocabulary'
import biosignalVocabulary from '../../../../core/src/assets/annotation/vocabulary/biosignal-events.json'

/** The shared acquisition set, loaded from the core checkout beside this package so an EEG test sees the real merged view. */
const BIOSIGNAL_CODED_EVENTS = codedEventsFromVocabulary(biosignalVocabulary as any)

export { codedEventsFromVocabulary, mergeCodedEvents }

export class GenericBiosignalEvent {
    /** The shared table; the statics below read `this.CODED_EVENTS` the way the real base class does. */
    static get CODED_EVENTS (): Record<string, Record<string, any>> {
        return BIOSIGNAL_CODED_EVENTS
    }
    static addStandardEventCodes (standard: string, codes: Record<string, Record<string, number | string>>) {
        for (const [category, events] of Object.entries(codes)) {
            const categoryEvents = this.CODED_EVENTS[category]
            if (!categoryEvents) {
                continue
            }
            for (const [eventName, eventCode] of Object.entries(events)) {
                const event = categoryEvents[eventName]
                if (!event) {
                    continue
                }
                if (!event.standardCodes) {
                    Object.assign(event, { standardCodes: {} })
                } else if (Object.hasOwn(event.standardCodes, standard)) {
                    continue
                }
                Object.assign(event.standardCodes, { [standard]: eventCode })
            }
        }
    }
    static extendEvents (category: string, events: Record<string, any>) {
        const categoryEvents = this.CODED_EVENTS[category]
        if (!categoryEvents) {
            throw new Error(`Category '${category}' does not exist in CODED_EVENTS.`)
        }
        for (const eventKey of Object.keys(events)) {
            if (Object.hasOwn(categoryEvents, eventKey)) {
                throw new Error(`Event key '${eventKey}' already exists in category '${category}'.`)
            }
        }
        Object.assign(categoryEvents, events)
    }
    static getEventForCode (code: string, standard?: string) {
        for (const category of Object.values(this.CODED_EVENTS)) {
            for (const event of Object.values(category)) {
                if (standard && event.standardCodes && event.standardCodes[standard] === code) {
                    return event
                } else if (event.code === code) {
                    return event
                }
            }
        }
        return null
    }
    static getEventForLabel (label: string, labelMatchers: Record<string, RegExp> = {}) {
        for (const category of Object.values(this.CODED_EVENTS)) {
            for (const event of Object.values(category)) {
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
    static labelFromTemplate(template: any): string {
        if (template.label) {
            return template.label
        }
        if (template.value === null || template.value === undefined) {
            return ''
        }
        return Array.isArray(template.value) ? template.value.join(', ') : String(template.value)
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
    pageLength: number | null = null
    pageStep: number | null = null
    timebaseUnit: string | null = null
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
    async getAllSignals(_range: number[], _config?: any): Promise<any> { return null }
    async releaseBuffers() { return Promise.resolve() }
    async unload() { return Promise.resolve() }
    async setupServiceWithInputMutex(_props: any) { return true }
    setupServiceWithCache(_props: any) { return true }
}

export class GenericBiosignalCascadeMontage extends GenericBiosignalMontage {
    protected _rowCount: number
    protected _sourceLabel: string
    constructor(
        name: string,
        recording: any,
        setup: any,
        sourceLabel: string,
        rowCount: number,
        pageLength: number,
        manager?: any,
        config?: any,
    ) {
        super(name, recording, setup, undefined, manager, config)
        this._rowCount = rowCount
        this._sourceLabel = sourceLabel
        this.pageLength = pageLength
        this.pageStep = rowCount * pageLength
        this.timebaseUnit = 'secPerPage'
    }
    protected _createChannel(_src: any, _rowIndex: number): any {
        // Modality subclasses override.
        return null
    }
    protected _resolveSourceChannel(): any {
        return this._setup?.channels?.find(
            (c: any) => c.label === this._sourceLabel || c.name === this._sourceLabel
        ) ?? null
    }
    mapChannels(): any[] {
        const src = this._resolveSourceChannel()
        if (!src) {
            return []
        }
        const channels = Array.from(
            { length: this._rowCount },
            (_, i) => this._createChannel(src, i),
        )
        this.channels = channels
        return channels
    }
    // Mirror of production slice logic so tests exercise the same shape — fetches one source
    // channel from the recording's raw-signal path (no montage worker) and slices into rowCount.
    async getAllSignals(range: number[], _config?: any): Promise<any> {
        if (!this.channels.length) {
            return null
        }
        const pageLength = this.pageLength ?? (range[1] - range[0])
        const expandedRange = [range[0], range[0] + this._rowCount * pageLength]
        const sourceIdx = this.channels[0]?.active
        if (typeof sourceIdx !== 'number') {
            return null
        }
        const response = await this.recording?.getAllRawSignals?.(expandedRange, { include: [sourceIdx] })
        if (!response?.signals?.length) {
            return null
        }
        const src = response.signals[0]
        const samplesPerRow = Math.round(pageLength * src.samplingRate)
        const signals: { data: Float32Array, samplingRate: number }[] = []
        for (let i = 0; i < this._rowCount; i++) {
            const startSample = i * samplesPerRow
            const endSample = startSample + samplesPerRow
            signals.push({
                data: src.data.subarray(startSample, endSample),
                samplingRate: src.samplingRate,
            })
        }
        return { start: range[0], end: range[1], signals }
    }
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
    addEventListener(_ev: any, _cb: any, _id?: any) { }
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
    onPropertyChange(_prop: any, _cb: any, _id?: any) { }
    async setupMutex() { return {} }
    async setupCache() { return {} }
    async cacheSignals() { return true }
    _relaySourceChannelChanges(channels: any[]) {
        for (const chan of channels) {
            chan.addEventListener(/^property-change:/, () => {
                this.dispatchPropertyChangeEvent('channels', this._channels, this._channels)
            }, this.id)
        }
    }
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
    onPropertyChange(_prop: any, _cb: any, _id?: any) { }
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

// Minimal stub for the trend asset hierarchy. EegTrend extends this; tests
// don't exercise trend math, but the constructor must not throw.
export class GenericBiosignalTrend {
    name: string = ''
    derivation: any = null
    epochLength: number = 0
    samplingRate: number = 0
    signal: any[] = []
    constructor (..._args: any[]) {}
    setupTrend (..._args: any[]) {}
    async computeTrend (..._args: any[]) { return Promise.resolve() }
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
