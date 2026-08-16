import EegSurfaceFieldMap from '../src/topography/EegSurfaceFieldMap'
import EegTopogram from '../src/topography/EegTopogram'
import { getElectrodePosition, resolveMontageElectrodes } from '../src/topography/electrodes'

const LABELS = 'Fp1,Fp2,F7,F3,Fz,F4,F8,T7,C3,Cz,C4,T8,P7,P3,Pz,P4,P8,O1,O2'.split(',')
const LEGACY = LABELS.map(
    label => ({ T7: 'T3', T8: 'T4', P7: 'T5', P8: 'T6' } as Record<string, string>)[label] ?? label
)

const match = EegSurfaceFieldMap.forLabels(LABELS)!
const map = match.map

/** One frame with a single channel deflected, in baked channel order. */
const oneHot = (label: string) => {
    const values = new Float32Array(map.channels.length)
    values[map.channels.indexOf(label)] = 1
    return values
}

describe('EegSurfaceFieldMap', () => {
    test('prefers the richest map a montage can feed', () => {
        // The IFCN array is the standard 19 plus the inferior temporal chain. A recording carrying it
        // must get the map that uses those six electrodes, not the 10-20 map that ignores them, and
        // that must not depend on the order the assets are declared in.
        const ifcn = [...LABELS, 'F9', 'F10', 'T9', 'T10', 'P9', 'P10']
        const matched = EegSurfaceFieldMap.forLabels(ifcn)!
        expect(matched).not.toBeNull()
        expect(matched.map.channels).toHaveLength(25)
        expect(matched.map.channels).toEqual(expect.arrayContaining(['F9', 'T10', 'P9']))
        expect(matched.indices.map(i => ifcn[i])).toEqual(matched.map.channels)
        // A partial inferior chain is not enough: the pseudo-inverse is over the whole channel set.
        expect(EegSurfaceFieldMap.forLabels([...LABELS, 'F9', 'F10'])!.map.channels).toHaveLength(19)
    })

    test('serves the IFCN array under the pre-1991 temporal names too', () => {
        const legacy = [...LEGACY, 'F9', 'F10', 'T9', 'T10', 'P9', 'P10']
        expect(EegSurfaceFieldMap.forLabels(legacy)!.map.channels).toHaveLength(25)
    })

    test('matches a baked map for the standard 19 channels', () => {
        expect(match).not.toBeNull()
        expect(map.montage).toBe('standard_1020')
        expect(match.indices).toHaveLength(19)
        expect(match.indices.map(i => LABELS[i])).toEqual(map.channels)
    })

    test('matches by position, so the pre-1991 temporal names also resolve', () => {
        const legacy = EegSurfaceFieldMap.forLabels(LEGACY)!
        expect(legacy).not.toBeNull()
        expect(legacy.indices).toEqual(match.indices)
        // The decoded asset is shared rather than decoded again per call.
        expect(legacy.map).toBe(map)
    })

    test('reindexes when the caller supplies its channels in another order', () => {
        const reversed = [...LABELS].reverse()
        const reordered = EegSurfaceFieldMap.forLabels(reversed)!
        expect(reordered.indices.map(i => reversed[i])).toEqual(map.channels)
    })

    test('refuses a channel list that is missing any baked channel', () => {
        expect(EegSurfaceFieldMap.forLabels(LABELS.slice(1))).toBeNull()
        expect(EegSurfaceFieldMap.forLabels([])).toBeNull()
        expect(EegSurfaceFieldMap.forLabels(['EKG', 'EMG'])).toBeNull()
    })

    test('tolerates extra channels around the ones it needs', () => {
        const extra = EegSurfaceFieldMap.forLabels(['EKG', ...LABELS, 'Photic', 'C1'])!
        expect(extra).not.toBeNull()
        expect(extra.indices).toEqual(match.indices.map(i => i + 1))
    })

    test('decodes a consistent mesh', () => {
        expect(map.vertices.length).toBe(map.nVertices*3)
        expect(map.normals.length).toBe(map.nVertices*3)
        expect(map.ao.length).toBe(map.nVertices)
        expect(map.electrodes.length).toBe(map.channels.length*3)
        expect(map.triangles.length%3).toBe(0)
        let maxIndex = 0
        for (const index of map.triangles) {
            if (index > maxIndex) {
                maxIndex = index
            }
        }
        expect(maxIndex).toBeLessThan(map.nVertices)
    })

    test('decodes unit normals and occlusion in the range the shader expects', () => {
        for (let v = 0; v < map.nVertices; v += 37) {
            const length = Math.hypot(map.normals[v*3], map.normals[v*3 + 1], map.normals[v*3 + 2])
            expect(length).toBeCloseTo(1, 3)
        }
        let min = Infinity, max = -Infinity
        for (const value of map.ao) {
            min = Math.min(min, value)
            max = Math.max(max, value)
        }
        expect(min).toBeGreaterThanOrEqual(0)
        expect(max).toBeLessThanOrEqual(1)
        expect(max).toBeGreaterThan(0.5)
    })

    test('places the decoded electrodes on their standard positions', () => {
        map.channels.forEach((label, i) => {
            const expected = getElectrodePosition(label)!
            expect(map.electrodes[i*3]).toBeCloseTo(expected.x, 5)
            expect(map.electrodes[i*3 + 1]).toBeCloseTo(expected.y, 5)
            expect(map.electrodes[i*3 + 2]).toBeCloseTo(expected.z, 5)
        })
    })

    test('lifts every electrode anchor onto the scalp mesh', () => {
        // The montage positions are defined on an idealised head and the mesh is a real scalp, so a
        // third of a 10-20 montage — the posterior electrodes worst of all — sits inside the mesh and
        // is hidden by it. Depth is measured against the nearest vertex's own plane, which is why the
        // tolerance is not zero: that vertex can be several millimetres away across the surface.
        const depthOf = (positions: Float32Array, electrode: number) => {
            let nearest = 0
            let best = Infinity
            for (let v = 0; v < map.nVertices; v++) {
                const distance = (map.vertices[v*3] - positions[electrode*3])**2
                             + (map.vertices[v*3 + 1] - positions[electrode*3 + 1])**2
                             + (map.vertices[v*3 + 2] - positions[electrode*3 + 2])**2
                if (distance < best) {
                    best = distance
                    nearest = v
                }
            }
            return (positions[electrode*3] - map.vertices[nearest*3])*map.normals[nearest*3]
                 + (positions[electrode*3 + 1] - map.vertices[nearest*3 + 1])*map.normals[nearest*3 + 1]
                 + (positions[electrode*3 + 2] - map.vertices[nearest*3 + 2])*map.normals[nearest*3 + 2]
        }
        let buriedBefore = 0
        for (let e = 0; e < map.nChannels; e++) {
            if (depthOf(map.electrodes, e) < -0.001) {
                buriedBefore++
            }
            // No anchor may be more than a fraction of a millimetre under the surface.
            expect(depthOf(map.electrodeAnchors, e)).toBeGreaterThan(-0.001)
        }
        // The projection has to be doing real work, or this test would pass on the raw positions.
        expect(buriedBefore).toBeGreaterThan(3)
    })

    test('keeps each anchor on its own ray from the sphere origin', () => {
        // Moving an electrode sideways would put its marker over a different part of the field.
        const origin = map.origin
        for (let e = 0; e < map.nChannels; e++) {
            const direction = (source: Float32Array) => {
                const x = source[e*3] - origin.x
                const y = source[e*3 + 1] - origin.y
                const z = source[e*3 + 2] - origin.z
                const length = Math.hypot(x, y, z)
                return [x/length, y/length, z/length]
            }
            const [ax, ay, az] = direction(map.electrodeAnchors)
            const [bx, by, bz] = direction(map.electrodes)
            expect(ax*bx + ay*by + az*bz).toBeCloseTo(1, 6)
        }
    })

    test('reuses the projected anchors rather than recomputing them', () => {
        expect(map.electrodeAnchors).toBe(map.electrodeAnchors)
    })

    test('the mesh is trimmed below the eye sockets but keeps the face', () => {
        let minZ = Infinity, maxZ = -Infinity
        for (let v = 0; v < map.nVertices; v++) {
            minZ = Math.min(minZ, map.vertices[v*3 + 2])
            maxZ = Math.max(maxZ, map.vertices[v*3 + 2])
        }
        // Trimming higher than about -0.035 would take the whole face with it.
        expect(minZ).toBeGreaterThanOrEqual(-0.061)
        expect(minZ).toBeLessThan(-0.04)
        expect(maxZ).toBeGreaterThan(0.08)
    })

    test('peaks over the electrode that was deflected', () => {
        for (const label of ['Cz', 'T8', 'O1', 'Fp2']) {
            const field = map.interpolate(oneHot(label))
            let peak = 0
            for (let v = 1; v < map.nVertices; v++) {
                if (field[v] > field[peak]) {
                    peak = v
                }
            }
            const position = getElectrodePosition(label)!
            const distance = Math.hypot(
                map.vertices[peak*3] - position.x,
                map.vertices[peak*3 + 1] - position.y,
                map.vertices[peak*3 + 2] - position.z,
            )
            // Within a few centimeters of the electrode, i.e. nearer to it than to its neighbours.
            expect(distance).toBeLessThan(0.035)
        }
    })

    test('agrees with the 2D topogram about where the field peaks', () => {
        // Both views are checked against anatomy rather than against each other, because their peaks
        // land on different things: a mesh vertex on a bumpy scalp on one side, a grid pixel on the
        // other. What must hold is that each peaks over the electrode that was deflected. Any sign
        // error in either projection is a displacement of half the head and shows up here at once.
        //
        // Only electrodes that project well inside the disc are usable: the outer ring falls near or
        // past the rim, where the masked grid pins the 2D peak to the edge instead of the true peak.
        const resolution = 128
        const topogram = EegTopogram.forPositions(
            resolveMontageElectrodes(map.channels).positions, resolution, map.origin
        )
        for (const label of ['Cz', 'C3', 'C4', 'Pz', 'Fz']) {
            const values = oneHot(label)
            const expected = topogram.project(getElectrodePosition(label)!)
            const field3d = map.interpolate(values)
            let peak3d = 0
            for (let v = 1; v < map.nVertices; v++) {
                if (field3d[v] > field3d[peak3d]) {
                    peak3d = v
                }
            }
            const projected = topogram.project({
                x: map.vertices[peak3d*3],
                y: map.vertices[peak3d*3 + 1],
                z: map.vertices[peak3d*3 + 2],
            })
            expect(Math.hypot(projected.x - expected.x, projected.y - expected.y))
                .toBeLessThan(resolution*0.08)
            const field2d = topogram.interpolate(values)
            let peak2d = 0
            for (let i = 1; i < field2d.length; i++) {
                if (field2d[i] > field2d[peak2d]) {
                    peak2d = i
                }
            }
            expect(Math.hypot(peak2d%resolution - expected.x, Math.floor(peak2d/resolution) - expected.y))
                .toBeLessThan(resolution*0.04)
        }
    })

    test('colors produce components inside the unit range', () => {
        const colors = map.colors(oneHot('Cz'))
        expect(colors.length).toBe(map.nVertices*3)
        for (const component of colors) {
            expect(component).toBeGreaterThanOrEqual(0)
            expect(component).toBeLessThanOrEqual(1)
        }
    })

    test('colors reuse a supplied buffer', () => {
        const out = new Float32Array(map.nVertices*3)
        expect(map.colors(oneHot('Cz'), out)).toBe(out)
    })

    test('isolines are whole segments on the shared levels', () => {
        const lines = map.isolines(oneHot('Cz'), 3)
        expect(lines.length).toBeGreaterThan(0)
        const limit = EegSurfaceFieldMap.limitOf(map.interpolate(oneHot('Cz')))
        expect(lines.map(line => line.level).sort((a, b) => a - b))
            .toEqual(EegTopogram.levels(limit, 3).sort((a, b) => a - b).filter(
                level => lines.some(line => line.level === level)
            ))
        for (const line of lines) {
            expect(line.points.length%6).toBe(0)
        }
    })

    test('isolines of a flat field are empty rather than degenerate', () => {
        expect(map.isolines(new Float32Array(map.channels.length))).toEqual([])
    })

    test('offsetting isolines lifts them off the scalp along the normal', () => {
        const values = oneHot('Cz')
        const flat = map.isolines(values, 3)
        const lifted = map.isolines(values, 3, undefined, 0.002)
        expect(lifted).toHaveLength(flat.length)
        const displacement = Math.hypot(
            lifted[0].points[0] - flat[0].points[0],
            lifted[0].points[1] - flat[0].points[1],
            lifted[0].points[2] - flat[0].points[2],
        )
        expect(displacement).toBeCloseTo(0.002, 4)
    })

    test('orderValues rejects an incomplete set instead of filling in zeros', () => {
        const complete: Record<string, number> = {}
        map.channels.forEach((label, i) => {
            complete[label] = i
        })
        const ordered = map.orderValues(complete)!
        expect(Array.from(ordered)).toEqual(map.channels.map((_, i) => i))
        delete complete[map.channels[3]]
        expect(map.orderValues(complete)).toBeNull()
    })

    test('rejects an asset written by a different layout version', () => {
        expect(() => new EegSurfaceFieldMap({
            version: 99, channels: [], montage: 'x', mode: 'accurate', nVertices: 0, nChannels: 0,
            origin: [0, 0, 0], vertices: '', normals: '', ao: '', triangles: '', electrodes: '',
            mapping: '',
        })).toThrow(/version 99/)
    })
})
