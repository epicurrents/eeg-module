export const MB_BYTES = 1024*1024
export const INDEX_NOT_ASSIGNED = -1
export function calculateSignalOffsets(channels?: any[], options?: any) {
    if (!channels || !Array.isArray(channels)) return []
    return channels.map((c: any, i: number) => ({ index: i, name: c?.name || `ch${i}` }))
}
export function secondsToTimeString(s: number, parts?: boolean) { return parts ? [s] : `${s}s` }
export function timePartsToShortString(parts: any) { return 'short' }
export function mapMontageChannels(setup: any, config: any) {
    // return empty mapping if no runtime settings
    return []
}
export function objectToReadOnly(obj: any) { return obj }

/**
 * Stub of the epoch-length resolver. Only the contract the trend builders branch on is modelled — a
 * configured length, or 0 when none can be derived; the scaling ladder itself belongs to core and is
 * tested there.
 */
export function resolveTrendEpochLength (
    _recordingDuration: number,
    config: { epochLength?: number } | undefined | null
) {
    return config?.epochLength && config.epochLength > 0 ? config.epochLength : 0
}

/** A null-prototype object, as core's own helper builds one. */
export function safeObjectFrom (template: object) {
    return Object.assign(Object.create(null), template)
}

/**
 * Stubs of the epoch-step helpers. They follow core's rules — no usable step means the epoch length, and the covered
 * end is the end of the last whole window — because the trend builders' scheduling depends on the values; the edge
 * cases are tested in core.
 */
export function resolveTrendEpochStep (epochLength: number, step: unknown) {
    return typeof step === 'number' && step > 0 && step <= epochLength ? step : epochLength
}

export function trendCoveredEnd (cachedEnd: number, epochLength: number, step: number) {
    return cachedEnd >= epochLength ? Math.floor((cachedEnd - epochLength) / step + 1e-9) * step + epochLength : 0
}

