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
