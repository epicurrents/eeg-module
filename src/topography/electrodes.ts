/**
 * Standard electrode position lookup for scalp topography.
 *
 * The spherical-spline topogram needs a 3D position per electrode, in the same MNE *head* coordinate frame the surface
 * field maps are baked in. The bundled table is the `standard_1005` montage, which is the superset carrying every
 * 10-20, 10-10 and 10-05 label. It also carries the pre-1991 temporal names at positions identical to their modern
 * equivalents, so T3/T4/T5/T6 resolve without an alias table and agree with T7/T8/P7/P8 to the bit.
 *
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import type { Point3D } from '#types/topography'

import ELECTRODES_1005 from '#config/topography/electrodes-1005.json'

const POSITIONS = ELECTRODES_1005.positions as Record<string, number[]>

/**
 * Labels that are in common use but are not the standard name for their position.
 *
 * In the 10-10 system the lateral-most column of the FC and CP rows is named for the two rows it lies between, FT and
 * TP, so there is no FC7 or CP8. Recordings and setup files label them that way regularly, and a label that does not
 * resolve is silently dropped from the interpolation, which is a spatial gap rather than a visible error. The
 * pre-1991 temporal names need no entry here: `standard_1005` carries T3/T4/T5/T6 itself, at positions identical to
 * T7/T8/P7/P8.
 */
const ALIASES: Record<string, string> = {
    CP7: 'TP7',
    CP8: 'TP8',
    FC7: 'FT7',
    FC8: 'FT8',
}

/**
 * Look up the head-coordinate position of a single electrode.
 *
 * Recording labels carry their reference in the same string often enough that a bare name lookup is not sufficient, so
 * a label that does not resolve as-is is retried without everything from the first hyphen on: `Fp1-Ref` resolves as
 * `Fp1`. Matching is case-insensitive, because no casing of `Fp1` is more correct than the others.
 * @param label - Electrode label as it appears on the channel.
 * @returns The position in meters, or null if the label is not a known electrode.
 */
export const getElectrodePosition = (label: string): Point3D | null => {
    const key = label.trim().toUpperCase()
    const bare = key.split('-')[0]
    const position = POSITIONS[key] ?? POSITIONS[bare]
                     ?? POSITIONS[ALIASES[key]] ?? POSITIONS[ALIASES[bare]]
    return position ? { x: position[0], y: position[1], z: position[2] } : null
}

/**
 * Work out which of a montage's channels are scalp electrodes, and where they are.
 *
 * Channels that carry no scalp position — an EKG lead typed as EEG, an annotation channel — must not become spline
 * knots, so they are dropped rather than given a made-up position, and `indices` records where each survivor came from.
 * A caller needs that correspondence to reorder signal values into the order the interpolation expects; without it,
 * dropping a channel would silently shift every value after it onto the wrong electrode.
 *
 * @param labels - Electrode labels as they appear on the channels, in the caller's own order.
 * @returns The resolved positions, and for each one its index in `labels`.
 */
export const resolveMontageElectrodes = (labels: string[]) => {
    const indices: number[] = []
    const positions: Point3D[] = []
    for (let i = 0; i < labels.length; i++) {
        const position = getElectrodePosition(labels[i])
        if (position) {
            indices.push(i)
            positions.push(position)
        }
    }
    return { indices, positions }
}
