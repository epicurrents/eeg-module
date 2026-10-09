/**
 * Voltage field topogram over a 2D scalp projection.
 *
 * Dependency-free implementation of the scalp-potential interpolation that MNE-Python performs for
 * `mne.viz.plot_topomap`. The method is the spherical spline of Perrin et al. (1989), which is what MNE itself uses in
 * `mne.channels.interpolation._make_interpolation_matrix`.
 *
 * Grid points are projected onto the unit sphere with the *azimuthal-equidistant* projection MNE uses for topomap
 * layouts, i.e. the 2D radius is the polar angle. An orthographic projection (`z = sqrt(1 - r^2)`) is the obvious
 * mistake and renders a nearly flat, wrong map. The pole is the axis of the 10-20 outer ring rather than the head
 * frame's `+z`; see `projectionBasis`.
 *
 * Use is two-phase, because the interpolation operator depends only on electrode geometry:
 * ```
 * const topo = EegTopogram.forPositions(positions, 300, origin)   // once per montage
 * topo.toRgba(values, imageData.data, limit, ramp)                // per frame
 * ```
 * Building the operator costs on the order of a quarter second at 300 x 300, so go through `forPositions`, which
 * caches; applying it costs about a millisecond, so there is no reason to precompute a time series of frames.
 *
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { DEFAULT_DIVERGING_RAMP, sampleRamp } from './colorRamp'
import { getElectrodePosition } from './electrodes'
import type { DivergingRamp, EegTopogramInterface, Isoline2D, Point3D } from '#types/topography'

/** Stiffness parameter `m` of the spline; 4 is the MNE/Perrin default. */
const STIFFNESS = 4
/** Number of Legendre terms in the series expansion. */
const N_LEGENDRE = 50
/** Ridge regularization added to the diagonal of the G matrix; MNE's default. */
const DEFAULT_ALPHA = 1e-5
/** Number of cached operators kept alive. Each is `resolution^2 * nChannels` floats, so a few megabytes at most. */
const CACHE_SIZE = 4
/**
 * Centre of the head in MNE head coordinates, in meters.
 *
 * Head coordinates are anchored to the nasion and the pre-auricular points, so this is an anatomical constant rather
 * than a guess: it is where the sphere fit lands for the standard arrays (within 2 mm for both the 10-20 and the IFCN
 * montages), and it is what a montage too sparse to fit its own sphere falls back to.
 */
const DEFAULT_ORIGIN: Point3D = { x: 0, y: 0.015, z: 0.043 }
/** Fewest electrodes that can over-determine the four parameters of a sphere well enough to trust the result. */
const MIN_FIT_ELECTRODES = 6
/** How far a fitted origin may sit from the anatomical default before it is rejected as a runaway, in meters. */
const MAX_ORIGIN_DRIFT = 0.02

const CACHE = new Map<string, EegTopogram>()

/**
 * Evaluate `sum(factors[n] * P_n(x))` over the Legendre polynomials using the standard three-term recurrence.
 * `factors[0]` is ignored, as it is always zero for the spline kernels.
 */
const legendreSum = (x: number, factors: Float64Array) => {
    let pPrev = 1
    let pCurr = x
    let sum = factors[1]*x
    for (let n = 2; n <= N_LEGENDRE; n++) {
        const pNext = ((2*n - 1)*x*pCurr - (n - 1)*pPrev)/n
        sum += factors[n]*pNext
        pPrev = pCurr
        pCurr = pNext
    }
    return sum
}

/** Coefficients of the `g` kernel of Perrin et al. (1989). */
const gFactors = () => {
    const factors = new Float64Array(N_LEGENDRE + 1)
    for (let n = 1; n <= N_LEGENDRE; n++) {
        factors[n] = (2*n + 1)/(Math.pow(n, STIFFNESS)*Math.pow(n + 1, STIFFNESS)*4*Math.PI)
    }
    return factors
}

/**
 * Solve `A X = B` in place by Gaussian elimination with partial pivoting.
 * @param a - Row-major `n` x `n` matrix (mutated).
 * @param b - Row-major `n` x `m` right-hand side (mutated and returned).
 */
const solveInPlace = (a: Float64Array, b: Float64Array, n: number, m: number) => {
    for (let col = 0; col < n; col++) {
        let pivot = col
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(a[row*n + col]) > Math.abs(a[pivot*n + col])) {
                pivot = row
            }
        }
        if (pivot !== col) {
            for (let k = 0; k < n; k++) {
                const t = a[col*n + k] ; a[col*n + k] = a[pivot*n + k] ; a[pivot*n + k] = t
            }
            for (let k = 0; k < m; k++) {
                const t = b[col*m + k] ; b[col*m + k] = b[pivot*m + k] ; b[pivot*m + k] = t
            }
        }
        const diag = a[col*n + col]
        for (let row = col + 1; row < n; row++) {
            const f = a[row*n + col]/diag
            if (!f) {
                continue
            }
            for (let k = col; k < n; k++) {
                a[row*n + k] -= f*a[col*n + k]
            }
            for (let k = 0; k < m; k++) {
                b[row*m + k] -= f*b[col*m + k]
            }
        }
    }
    for (let col = n - 1; col >= 0; col--) {
        for (let k = 0; k < m; k++) {
            let sum = b[col*m + k]
            for (let j = col + 1; j < n; j++) {
                sum -= a[col*n + j]*b[j*m + k]
            }
            b[col*m + k] = sum/a[col*n + col]
        }
    }
    return b
}

const normalize = (p: Point3D): [number, number, number] => {
    const r = Math.hypot(p.x, p.y, p.z) || 1
    return [p.x/r, p.y/r, p.z/r]
}

type Vector = [number, number, number]

/** Axes of the 2D projection in head coordinates: image right, image up and the pole. */
type ProjectionBasis = { anterior: Vector, pole: Vector, right: Vector }

/** The 10-20 outer ring, whose axis is the projection's pole. */
const OUTER_RING = ['Fpz', 'T7', 'Oz', 'T8']

const unit = (v: Vector): Vector => {
    const r = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0]/r, v[1]/r, v[2]/r]
}
const cross = (a: Vector, b: Vector): Vector => [
    a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0],
]
const dot3 = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

/**
 * Axes of the projection about a sphere origin: the pole along the axis of the 10-20 outer ring, image right towards
 * the subject's right and image up towards the nose.
 *
 * The head frame's `+z` is the obvious pole and a tilted one. Head coordinates are anchored to the nasion and the
 * pre-auricular points, while the outer ring runs a tenth of the way up from nasion and inion, and the inion sits
 * higher than the nasion: Oz is about three centimetres above Fpz. About `+z` the ring is tilted some eight degrees,
 * so the frontopolar electrodes project well outside the head circle while the occipital ones fall inside it, and the
 * midline is stretched in front and compressed behind (Fz twice as far out as Pz is in). About the ring's own axis
 * the outer ring lands at one radius all round, Fz and Pz mirror each other and Cz sits at the centre, which is the
 * symmetry a reader of 10-20 topograms expects. The ring is read from the bundled table, so the pole is the same for
 * every montage given in its head frame, whichever electrodes the montage itself carries.
 */
const projectionBasis = (c: Point3D): ProjectionBasis => {
    const ring = OUTER_RING.map(label => {
        const p = getElectrodePosition(label)!
        return normalize({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z })
    })
    // The normal of the plane through the four directions: front-to-back crossed with left-to-right points up.
    const frontBack: Vector = [ring[0][0] - ring[2][0], ring[0][1] - ring[2][1], ring[0][2] - ring[2][2]]
    const leftRight: Vector = [ring[1][0] - ring[3][0], ring[1][1] - ring[3][1], ring[1][2] - ring[3][2]]
    const pole = unit(cross(frontBack, leftRight))
    // The head frame's x axis with its component along the pole removed, so right stays right.
    const right = unit([1 - pole[0]*pole[0], -pole[0]*pole[1], -pole[0]*pole[2]])
    return { anterior: cross(pole, right), pole, right }
}

/**
 * Least-squares centre of the sphere through a set of electrodes, when the electrodes can determine one.
 *
 * The centroid is the obvious choice and the wrong one: electrodes cover the upper head only, so their centroid sits
 * well above the centre of the sphere they lie on, and every projection about it is skewed — the temporal ring lands
 * further out than it should and the layout stops matching MNE's. This is the algebraic (Kåsa) fit, which is what a
 * cap-shaped point set needs and what MNE's own automatic origin amounts to.
 *
 * A sphere has four parameters, so four points determine one *exactly* — and a reduced montage's four points are
 * nearly coplanar, which puts that exact sphere's centre tens of centimetres outside the head. Every electrode then
 * sits at almost the same polar angle from it, so the markers collapse towards the middle of the disc and, worse, the
 * interpolation runs about a pole that is nowhere near the head. The fit is therefore only trusted when the montage
 * genuinely over-determines it and the answer lands where a head centre can be; otherwise the anatomical default
 * stands in, which is right to within a few millimetres for any montage and cannot run away.
 */
const fitSphereOrigin = (positions: Point3D[]): Point3D => {
    const n = positions.length
    if (n < MIN_FIT_ELECTRODES) {
        return DEFAULT_ORIGIN
    }
    const centroid = {
        x: positions.reduce((s, p) => s + p.x, 0)/n,
        y: positions.reduce((s, p) => s + p.y, 0)/n,
        z: positions.reduce((s, p) => s + p.z, 0)/n,
    }
    // Solve the normal equations of |p|^2 = 2*c.p + d for the unknowns (c, d).
    const ata = new Float64Array(16)
    const atb = new Float64Array(4)
    for (const p of positions) {
        const row = [2*(p.x - centroid.x), 2*(p.y - centroid.y), 2*(p.z - centroid.z), 1]
        const value = (p.x - centroid.x)**2 + (p.y - centroid.y)**2 + (p.z - centroid.z)**2
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                ata[i*4 + j] += row[i]*row[j]
            }
            atb[i] += row[i]*value
        }
    }
    const solved = solveInPlace(ata, atb, 4, 1)
    if (!solved.every(Number.isFinite)) {
        return DEFAULT_ORIGIN
    }
    const fitted = { x: centroid.x + solved[0], y: centroid.y + solved[1], z: centroid.z + solved[2] }
    // Head coordinates are anchored to the nasion and the pre-auricular points, so a real head centre is always near
    // the default. A fit that is not is a runaway, not a differently shaped head, and the tolerance can be tight: the
    // fit only ever refines the default by a millimetre or two, so rejecting a good one costs nothing.
    const drift = Math.hypot(
        fitted.x - DEFAULT_ORIGIN.x, fitted.y - DEFAULT_ORIGIN.y, fitted.z - DEFAULT_ORIGIN.z
    )
    return drift <= MAX_ORIGIN_DRIFT ? fitted : DEFAULT_ORIGIN
}

export default class EegTopogram implements EegTopogramInterface {
    /**
     * Get a topogram for the given geometry, building it only if an identical one is not already cached.
     *
     * The operator depends on nothing but geometry and grid size, so a cache hit is exact rather than an approximation.
     * It matters because building takes long enough to be felt, and a tool that is destroyed and recreated whenever its
     * panel is hidden would otherwise pay that cost repeatedly.
     * @param positions - Electrode positions in head coordinates.
     * @param resolution - Side length of the square output grid in pixels.
     * @param origin - Center of the head sphere; defaults to a least-squares fit through `positions`, or the anatomical default where they cannot determine one.
     * @param extent - Radius the grid reaches, in head radii; 1 confines the field to the head circle (see `extent`).
     */
    static forPositions (positions: Point3D[], resolution = 200, origin?: Point3D, extent = 1) {
        const key = JSON.stringify([
            positions.map(p => [p.x, p.y, p.z]),
            resolution,
            origin ? [origin.x, origin.y, origin.z] : null,
            extent,
        ])
        const cached = CACHE.get(key)
        if (cached) {
            // Refresh the insertion order so the least recently used entry is the one evicted.
            CACHE.delete(key)
            CACHE.set(key, cached)
            return cached
        }
        const topogram = new EegTopogram(positions, resolution, origin, DEFAULT_ALPHA, extent)
        CACHE.set(key, topogram)
        while (CACHE.size > CACHE_SIZE) {
            CACHE.delete(CACHE.keys().next().value as string)
        }
        return topogram
    }

    /**
     * Contour levels used by both this class and `EegSurfaceFieldMap.isolines`, so a 2D topogram and a 3D field map
     * drawn from the same frame show the same isopotentials.
     * @param limit - End of the value scale. The levels divide it evenly and stop short of it, so the outermost contour sits at `limit * nLevels / (nLevels + 1)`.
     * @param nLevels - Number of levels either side of zero.
     */
    static levels (limit: number, nLevels: number) {
        const out: number[] = []
        for (let l = 1; l <= nLevels; l++) {
            out.push(-limit*l/(nLevels + 1), limit*l/(nLevels + 1))
        }
        return out
    }

    /**
     * Symmetric limit for the colour scale, i.e. the largest absolute value in a frame.
     * @param field - Per-pixel values from `interpolate`, or the electrode values themselves for a limit that does not depend on how much of the field is drawn.
     */
    static limitOf (field: ArrayLike<number>) {
        let lim = 0
        for (let i = 0; i < field.length; i++) {
            const a = Math.abs(field[i])
            if (a > lim) {
                lim = a
            }
        }
        return lim
    }

    /** True for grid pixels inside the field's disc, of radius `extent`. */
    protected _mask: Uint8Array
    protected _nChannels: number
    /** Row-major `nPixels` x `nChannels` interpolation operator. */
    protected _operator: Float32Array
    /** Axes of the projection about `_origin`; see `projectionBasis`. */
    protected _basis: ProjectionBasis
    /** Radius the grid's inscribed disc reaches, in head radii. */
    protected _extent: number
    /** Center of the fitted head sphere, i.e. the centre of the projection. */
    protected _origin: Point3D
    /** Electrode positions in head coordinates, in the order values are supplied. */
    protected _positions: Point3D[]
    protected _resolution: number

    /**
     * Build the interpolation operator for a fixed electrode geometry.
     * @param positions - Electrode positions in head coordinates.
     * @param resolution - Side length of the square output grid in pixels.
     * @param origin - Center of the head sphere; defaults to a least-squares fit through `positions`. Pass the origin
     *                 a surface field map of the same montage was baked around, or the two views disagree.
     * @param alpha - Ridge regularization; MNE's default is 1e-5.
     * @param extent - Radius the grid reaches, in head radii; 1 confines the field to the head circle (see `extent`).
     */
    constructor (
        positions: Point3D[],
        resolution = 200,
        origin?: Point3D,
        alpha = DEFAULT_ALPHA,
        extent = 1,
    ) {
        const n = positions.length
        this._extent = extent > 0 ? extent : 1
        this._resolution = resolution
        this._nChannels = n
        const c = origin ?? fitSphereOrigin(positions)
        this._origin = c
        this._basis = projectionBasis(c)
        this._positions = positions
        const from = positions.map(p => normalize({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }))
        const factors = gFactors()
        const dot = (a: number[], b: number[]) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

        // Build C = [[G + alpha*I, 1], [1^T, 0]] and invert it once.
        const N = n + 1
        const cMat = new Float64Array(N*N)
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                cMat[i*N + j] = legendreSum(dot(from[i], from[j]), factors) + (i === j ? alpha : 0)
            }
            cMat[i*N + n] = 1
            cMat[n*N + i] = 1
        }
        const cInv = new Float64Array(N*N)
        for (let i = 0; i < N; i++) {
            cInv[i*N + i] = 1
        }
        solveInPlace(cMat, cInv, N, N)

        // Project every grid pixel onto the sphere and accumulate its operator row.
        //
        // Row 0 of the output buffer is the TOP row of an ImageData, so it must map to +y in head coordinates: the
        // convention is a view from above with the nose up and the subject's right on the image right. Hence gy counts
        // down, not up. Reversing it flips the map vertically and silently desynchronises it from the 3D view.
        const nPixels = resolution*resolution
        this._operator = new Float32Array(nPixels*n)
        this._mask = new Uint8Array(nPixels)
        const row = new Float64Array(N)
        for (let py = 0; py < resolution; py++) {
            const gy = 1 - 2*(py + 0.5)/resolution
            for (let px = 0; px < resolution; px++) {
                const gx = 2*(px + 0.5)/resolution - 1
                const idx = py*resolution + px
                const rad = Math.hypot(gx, gy)
                if (rad > 1) {
                    continue
                }
                this._mask[idx] = 1
                // Inverse azimuthal-equidistant projection: the 2D radius is the polar angle from the pole.
                const pol = rad*this._extent*Math.PI/2
                const az = Math.atan2(gy, gx)
                const along = [Math.sin(pol)*Math.cos(az), Math.sin(pol)*Math.sin(az), Math.cos(pol)]
                const { anterior, pole, right } = this._basis
                const to = [0, 1, 2].map(i => along[0]*right[i] + along[1]*anterior[i] + along[2]*pole[i])
                for (let j = 0; j < n; j++) {
                    row[j] = legendreSum(dot(to, from[j]), factors)
                }
                row[n] = 1
                for (let ch = 0; ch < n; ch++) {
                    let sum = 0
                    for (let k = 0; k < N; k++) {
                        sum += row[k]*cInv[k*N + ch]
                    }
                    this._operator[idx*n + ch] = sum
                }
            }
        }
    }

    /**
     * Radius the field reaches, in head radii, where 1 is the head circle.
     *
     * At 1 the field is confined to the head model and the outer electrode ring sits just past its edge. A larger
     * extent carries it out to electrodes below the sphere's equator — the inferior temporal chain of the IFCN array
     * reaches about 1.3 — which the spline is fitted to as knots like any other, so the field there is interpolated
     * between measured values rather than extrapolated past them. The grid keeps its resolution, so a larger extent
     * spreads the same pixels over more of the head.
     */
    get extent () {
        return this._extent
    }
    get mask () {
        return this._mask
    }
    get nChannels () {
        return this._nChannels
    }
    /** Center of the fitted head sphere, in head coordinates. */
    get origin () {
        return this._origin
    }
    /** Electrode positions in head coordinates, in the order values are supplied. */
    get positions () {
        return this._positions
    }
    get resolution () {
        return this._resolution
    }

    /**
     * Where to draw a marker for every electrode of this montage, in the order values are supplied.
     *
     * Each marker is the electrode's own projection, the pixel where the field takes its value. MNE's topomap layout
     * additionally scales each position by its distance from the sphere origin, which suits MNE, whose topomap
     * interpolates in 2D over those same scaled positions; under a 3D spline, which knows only directions, it moves a
     * marker off its own value, by a tenth of the head radius for the frontopolar and temporal pairs of a 10-20 cap.
     * The outer ring lands on or just outside the head circle, by as much as it wraps below the sphere's equator, so a
     * caller must leave margin around the disc rather than clip it away.
     */
    electrodePixels () {
        return this._positions.map(position => this.project(position))
    }

    /**
     * Interpolate one frame of channel values onto the grid.
     * @param values - One voltage per electrode, in montage order.
     * @param out - Optional reusable output buffer of `resolution^2` floats.
     */
    interpolate (values: ArrayLike<number>, out?: Float32Array) {
        const nPixels = this._resolution*this._resolution
        const n = this._nChannels
        const dst = out ?? new Float32Array(nPixels)
        for (let p = 0, k = 0; p < nPixels; p++, k += n) {
            if (!this._mask[p]) {
                dst[p] = 0
                continue
            }
            let sum = 0
            for (let ch = 0; ch < n; ch++) {
                sum += this._operator[k + ch]*values[ch]
            }
            dst[p] = sum
        }
        return dst
    }

    /**
     * Extract field contours by marching squares. Points are in pixel coordinates on the `resolution` x `resolution`
     * grid, so they can be stroked straight onto the canvas `toRgba` fills. Segments are unordered, so stroke them as
     * independent lines rather than as a path.
     *
     * @param values - One voltage per electrode, in montage order.
     * @param nLevels - Number of contour levels either side of zero.
     * @param limit - Outermost contour value; defaults to the frame maximum.
     */
    isolines (values: ArrayLike<number>, nLevels = 5, limit?: number): Isoline2D[] {
        const res = this._resolution
        const field = this.interpolate(values)
        const lim = limit ?? EegTopogram.limitOf(field)
        if (lim <= 0) {
            return []
        }
        const out: Isoline2D[] = []
        for (const level of EegTopogram.levels(lim, nLevels)) {
            const pts: number[] = []
            for (let y = 0; y < res - 1; y++) {
                for (let x = 0; x < res - 1; x++) {
                    const i = y*res + x
                    if (!this._mask[i] || !this._mask[i + 1] ||
                        !this._mask[i + res] || !this._mask[i + res + 1]) {
                        continue
                    }
                    // Corners, clockwise from top-left.
                    const f = [
                        field[i] - level, field[i + 1] - level,
                        field[i + res + 1] - level, field[i + res] - level,
                    ]
                    const cx = [x, x + 1, x + 1, x], cy = [y, y, y + 1, y + 1]
                    const hits: number[] = []
                    for (let e = 0; e < 4; e++) {
                        const a = e, b = (e + 1)%4
                        if ((f[a] < 0) === (f[b] < 0)) {
                            continue
                        }
                        const w = f[a]/(f[a] - f[b])
                        hits.push(cx[a] + w*(cx[b] - cx[a]) + 0.5, cy[a] + w*(cy[b] - cy[a]) + 0.5)
                    }
                    // Two crossings is the ordinary case; four is a saddle, where either pairing is defensible, so
                    // take them in order rather than resolving an ambiguity the data does not settle.
                    for (let k = 0; k + 4 <= hits.length; k += 4) {
                        pts.push(hits[k], hits[k + 1], hits[k + 2], hits[k + 3])
                    }
                }
            }
            if (pts.length) {
                out.push({ level, points: Float32Array.from(pts) })
            }
        }
        return out
    }

    /**
     * Project a point in head coordinates onto the grid.
     *
     * This is the forward of the azimuthal-equidistant projection the operator inverts, about the same sphere origin,
     * so a marker drawn at the returned pixel sits exactly over the field the electrode produced. Deriving marker
     * positions any other way — a layout table, an orthographic projection — puts them subtly off the field they
     * belong to, which is worse than not drawing them.
     *
     * This is purely directional, about the pole `projectionBasis` gives, and `electrodePixels` draws the markers with
     * it unchanged. The 10-20 outer ring lies at or a little below the sphere's equator and so lands on or just outside
     * the head circle, evenly all round.
     *
     * @param point - Position in head coordinates, in meters.
     * @returns Pixel coordinates on the `resolution` x `resolution` grid, and the projected radius, where 1 is the
     *          head circle.
     */
    project (point: Point3D) {
        const c = this._origin
        const d = normalize({ x: point.x - c.x, y: point.y - c.y, z: point.z - c.z })
        const { anterior, pole, right } = this._basis
        const [ux, uy, uz] = [dot3(d, right), dot3(d, anterior), dot3(d, pole)]
        const pol = Math.acos(uz < -1 ? -1 : uz > 1 ? 1 : uz)
        const radius = pol/(Math.PI/2)
        const az = Math.atan2(uy, ux)
        const gx = radius/this._extent*Math.cos(az)
        const gy = radius/this._extent*Math.sin(az)
        return {
            radius,
            x: (gx + 1)*this._resolution/2 - 0.5,
            y: (1 - gy)*this._resolution/2 - 0.5,
        }
    }

    /**
     * Interpolate and write straight into an RGBA buffer using a diverging ramp. Pixels outside the field's disc are
     * left fully transparent.
     *
     * Named for what it produces rather than for drawing: this class does no rendering, it only fills a pixel buffer
     * the caller may hand to a canvas.
     *
     * @param values - One voltage per electrode, in montage order.
     * @param rgba - Destination, e.g. `ImageData.data` of a `resolution` x `resolution` canvas.
     * @param limit - Value mapped to full saturation; defaults to the frame maximum. Pass an explicit limit for a fixed
     *                scale across a time window, because per-frame autoscaling hides amplitude changes entirely.
     * @param ramp - Colour ramp; defaults to the shared default.
     */
    toRgba (
        values: ArrayLike<number>,
        rgba: Uint8ClampedArray,
        limit?: number,
        ramp: DivergingRamp = DEFAULT_DIVERGING_RAMP,
    ) {
        const field = this.interpolate(values)
        const lim = limit ?? EegTopogram.limitOf(field)
        const scale = lim > 0 ? 1/lim : 0
        const rgb = new Float32Array(3)
        for (let p = 0, o = 0; p < field.length; p++, o += 4) {
            if (!this._mask[p]) {
                rgba[o] = rgba[o + 1] = rgba[o + 2] = rgba[o + 3] = 0
                continue
            }
            sampleRamp(field[p]*scale, ramp, rgb)
            rgba[o]     = rgb[0]*255
            rgba[o + 1] = rgb[1]*255
            rgba[o + 2] = rgb[2]*255
            rgba[o + 3] = 255
        }
        return rgba
    }
}
