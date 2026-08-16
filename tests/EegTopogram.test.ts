import EegTopogram from '../src/topography/EegTopogram'
import { resolveMontageElectrodes } from '../src/topography/electrodes'

const LABELS = 'Fp1,Fp2,F7,F3,Fz,F4,F8,T7,C3,Cz,C4,T8,P7,P3,Pz,P4,P8,O1,O2'.split(',')
const RESOLUTION = 64

const positions = resolveMontageElectrodes(LABELS).positions
const topogram = EegTopogram.forPositions(positions, RESOLUTION)

/** One frame with a single channel deflected, for testing where the field lands. */
const oneHot = (label: string) => {
    const values = new Float32Array(LABELS.length)
    values[LABELS.indexOf(label)] = 1
    return values
}

/** Grid index of the largest value in a frame. */
const peakOf = (field: Float32Array) => {
    let peak = 0
    for (let i = 1; i < field.length; i++) {
        if (field[i] > field[peak]) {
            peak = i
        }
    }
    return { x: peak%RESOLUTION, y: Math.floor(peak/RESOLUTION) }
}

describe('EegTopogram', () => {
    test('masks a disc inscribed in the square grid', () => {
        let inside = 0
        for (const value of topogram.mask) {
            inside += value
        }
        // The disc covers pi/4 of the square; the tolerance is the pixel staircase at this resolution.
        expect(inside/(RESOLUTION*RESOLUTION)).toBeCloseTo(Math.PI/4, 2)
        expect(topogram.mask[0]).toBe(0)
        expect(topogram.mask[Math.floor(RESOLUTION*RESOLUTION/2 + RESOLUTION/2)]).toBe(1)
    })

    test('reproduces each electrode value at that electrode position', () => {
        // A spline interpolates its knots. Reading at the projected electrode pixel is what proves
        // `project` inverts the operator's own projection rather than some other one; the residual is
        // the half-pixel between the knot and the nearest pixel centre, not an interpolation error.
        const values = Float32Array.from(positions.map(position => position.z*20))
        const field = topogram.interpolate(values)
        for (let i = 0; i < positions.length; i++) {
            const pixel = topogram.project(positions[i])
            if (pixel.radius > 0.95) {
                continue // Outside the masked disc, so there is no pixel to read.
            }
            const index = Math.round(pixel.y)*RESOLUTION + Math.round(pixel.x)
            expect(Math.abs(field[index] - values[i])).toBeLessThan(0.06)
        }
    })

    test('places an anterior deflection in the upper half of the buffer', () => {
        // Row 0 of the buffer is the TOP row of an ImageData, so it must map to +y, the nose. Getting
        // this backwards flips the map and silently desynchronises it from the 3D view.
        expect(peakOf(topogram.interpolate(oneHot('Fz'))).y).toBeLessThan(RESOLUTION/2)
        expect(peakOf(topogram.interpolate(oneHot('Pz'))).y).toBeGreaterThan(RESOLUTION/2)
    })

    test("places a right-hemisphere deflection on the image right", () => {
        // The 2D view is from above with the nose up, so the subject's right is the image right.
        expect(peakOf(topogram.interpolate(oneHot('T8'))).x).toBeGreaterThan(RESOLUTION/2)
        expect(peakOf(topogram.interpolate(oneHot('T7'))).x).toBeLessThan(RESOLUTION/2)
    })

    test('projects the vertex electrode near the centre of the grid', () => {
        const pixel = topogram.project(topogram.positions[LABELS.indexOf('Cz')])
        expect(pixel.radius).toBeLessThan(0.1)
        expect(Math.abs(pixel.x - (RESOLUTION/2 - 0.5))).toBeLessThan(RESOLUTION*0.05)
        expect(Math.abs(pixel.y - (RESOLUTION/2 - 0.5))).toBeLessThan(RESOLUTION*0.05)
    })

    test('electrodePixels covers every channel in value order', () => {
        const pixels = topogram.electrodePixels()
        expect(pixels).toHaveLength(LABELS.length)
        // The vertex electrode is nearest the pole of the projection and everything else is further out.
        const radii = pixels.map(pixel => pixel.radius)
        expect(radii.indexOf(Math.min(...radii))).toBe(LABELS.indexOf('Cz'))
        // Part of the outer ring falls beyond the head circle here as it does in MNE, but not far
        // beyond: a marker outside the canvas entirely would be a projection error, not a layout one.
        // This topogram uses the default centroid origin; the baked sphere origin pulls the ring in.
        expect(Math.max(...radii)).toBeLessThan(1.35)
    })

    test('electrodePixels applies the topomap layout scaling, project does not', () => {
        // The layout pulls the temporal ring back onto the head circle, which is where a reader of
        // MNE topomaps expects it; the pure projection leaves it a tenth of a radius outside.
        const temporal = LABELS.indexOf('T8')
        const projected = topogram.project(topogram.positions[temporal])
        const drawn = topogram.electrodePixels()[temporal]
        expect(projected.radius).toBeGreaterThan(1)
        expect(drawn.radius).toBeLessThan(projected.radius)
        // Both stay on the same side of the head; the scaling is radial, not a different projection.
        const centre = RESOLUTION/2 - 0.5
        expect(Math.sign(drawn.x - centre)).toBe(Math.sign(projected.x - centre))
    })

    test('scales an all-zero frame without dividing by zero', () => {
        const rgba = new Uint8ClampedArray(RESOLUTION*RESOLUTION*4)
        topogram.toRgba(new Float32Array(LABELS.length), rgba)
        const centre = (Math.floor(RESOLUTION/2)*RESOLUTION + Math.floor(RESOLUTION/2))*4
        expect(Number.isNaN(rgba[centre])).toBe(false)
        expect(rgba[centre + 3]).toBe(255)
    })

    test('leaves pixels outside the head circle fully transparent', () => {
        const rgba = new Uint8ClampedArray(RESOLUTION*RESOLUTION*4)
        topogram.toRgba(oneHot('Cz'), rgba)
        expect(rgba[3]).toBe(0)
        expect(rgba[(Math.floor(RESOLUTION/2)*RESOLUTION + Math.floor(RESOLUTION/2))*4 + 3]).toBe(255)
    })

    test('an explicit limit fixes the scale instead of autoscaling per frame', () => {
        const centre = (Math.floor(RESOLUTION/2)*RESOLUTION + Math.floor(RESOLUTION/2))*4
        const strong = new Uint8ClampedArray(RESOLUTION*RESOLUTION*4)
        const weak = new Uint8ClampedArray(RESOLUTION*RESOLUTION*4)
        const values = oneHot('Cz')
        topogram.toRgba(values, strong, 1)
        topogram.toRgba(Float32Array.from(values, v => v*0.2), weak, 1)
        // Autoscaling would render these identically, which is exactly what hides amplitude changes.
        expect(strong[centre]).not.toBe(weak[centre])
        const auto = new Uint8ClampedArray(RESOLUTION*RESOLUTION*4)
        topogram.toRgba(Float32Array.from(values, v => v*0.2), auto)
        expect(auto[centre]).not.toBe(weak[centre])
    })

    test('levels are symmetric about zero and exclude both zero and the limit', () => {
        const levels = EegTopogram.levels(1, 3)
        expect(levels).toHaveLength(6)
        expect(levels.reduce((sum, level) => sum + level, 0)).toBeCloseTo(0, 12)
        expect(Math.max(...levels)).toBeLessThan(1)
        expect(Math.min(...levels.map(Math.abs))).toBeGreaterThan(0)
    })

    test('isolines stay inside the masked disc and carry the shared levels', () => {
        const lines = topogram.isolines(oneHot('Cz'), 3)
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) {
            expect(line.points.length%4).toBe(0)
            for (let i = 0; i < line.points.length; i += 2) {
                const dx = line.points[i] - RESOLUTION/2
                const dy = line.points[i + 1] - RESOLUTION/2
                expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(RESOLUTION/2)
            }
        }
    })

    test('isolines of a flat field are empty rather than degenerate', () => {
        expect(topogram.isolines(new Float32Array(LABELS.length))).toEqual([])
    })

    test('forPositions returns the same operator for the same geometry', () => {
        // Building costs a quarter of a second at display resolution, and the tool is recreated every
        // time its panel is shown, so a miss here is felt directly.
        expect(EegTopogram.forPositions(positions, RESOLUTION)).toBe(topogram)
        expect(EegTopogram.forPositions(positions, RESOLUTION + 1)).not.toBe(topogram)
    })

    test('fits the same sphere origin MNE picks automatically', () => {
        // mne.bem._check_origin('auto') on the standard 10-20 montage. A montage with no baked field
        // map has no origin to inherit, so the fit is what keeps its layout matching MNE's.
        const origin = topogram.origin
        expect(origin.x).toBeCloseTo(-0.00092, 5)
        expect(origin.y).toBeCloseTo(0.01581, 5)
        expect(origin.z).toBeCloseTo(0.04538, 5)
        // The centroid of a cap-shaped point set sits well above the sphere centre; that is the
        // whole reason the fit exists.
        const centroidZ = positions.reduce((sum, position) => sum + position.z, 0)/positions.length
        expect(centroidZ - origin.z).toBeGreaterThan(0.01)
    })

    test('falls back to the anatomical origin when the montage cannot determine one', () => {
        // Four points determine a sphere exactly, and a reduced montage's four are nearly coplanar, so
        // the exact sphere through them is centred far outside the head. Every electrode then sits at
        // almost the same polar angle from it and the whole montage collapses towards the middle of
        // the disc — with the interpolation running about the same wrong pole, not just the markers.
        for (const labels of [['Fp2', 'F8', 'Fp1', 'F7'], ['T7', 'T8', 'P7', 'P8'], ['Fz', 'Cz', 'Pz']]) {
            const reduced = resolveMontageElectrodes(labels).positions
            const origin = EegTopogram.forPositions(reduced, 32).origin
            expect(Math.hypot(origin.x, origin.y - 0.015, origin.z - 0.043)).toBeLessThan(0.001)
            // Every electrode must end up a plausible head radius from it, and spread out rather than
            // bunched: a collapsed montage shows as a set of near-identical small radii.
            const radii = reduced.map(p => Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z))
            expect(Math.min(...radii)).toBeGreaterThan(0.05)
            expect(Math.max(...radii)).toBeLessThan(0.15)
        }
    })

    test('keeps the fitted origin when the montage does determine one', () => {
        // The guard must not throw away a good fit; the full montage still gets its own sphere.
        expect(topogram.origin.z).not.toBeCloseTo(0.043, 4)
        expect(topogram.origin.y).not.toBeCloseTo(0.015, 4)
    })

    test('an explicit origin changes the projection', () => {
        const shifted = EegTopogram.forPositions(positions, RESOLUTION, { x: 0.02, y: 0, z: 0 })
        expect(shifted).not.toBe(topogram)
        expect(shifted.project(positions[0]).x).not.toBeCloseTo(topogram.project(positions[0]).x, 3)
    })
})
