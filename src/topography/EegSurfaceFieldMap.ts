/**
 * Voltage field map on a 3D scalp surface.
 *
 * Runtime half of the surface field map MNE-Python computes via `mne.make_field_map`. The expensive part, the
 * lead-field dot products and the regularized pseudo-inverse, depends only on electrode and scalp geometry, so it is
 * baked offline by `tools/topography/bake_fieldmap.py` into a dense mapping matrix. MNE's own docstring for
 * `_make_surface_mapping` states the contract this class rests on: `new_data = np.dot(mapping, data)`.
 *
 * A frame is therefore one matrix-vector product plus a colour ramp, on the order of a tenth of a millisecond. Nothing
 * here needs Pyodide, numpy or MNE.
 *
 * The mapping matrix is baked with the average-reference projector applied, so it expects the values the app displays
 * for a common-reference montage and re-references them itself. Subtracting the channel mean beforehand is harmless
 * but redundant.
 *
 * The mesh is exposed as plain typed arrays, ready for a vertex buffer without conversion.
 *
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import { DEFAULT_DIVERGING_RAMP, sampleRamp } from './colorRamp'
import { getElectrodePosition } from './electrodes'
import type {
    DivergingRamp,
    EegSurfaceFieldMapInterface,
    EncodedFieldMap,
    FieldMapChannelMatch,
    Isoline3D,
    Point3D,
} from '#types/topography'
import EegTopogram from './EegTopogram'

import FIELDMAP_1020 from '#config/topography/fieldmap-1020.json'
import FIELDMAP_IFCN25 from '#config/topography/fieldmap-ifcn25.json'

/** Asset layout this decoder understands; `bake_fieldmap.py` writes the same number. */
const ASSET_VERSION = 1
/** Positions closer than this are the same electrode, in meters. Electrode spacing is centimeters. */
const POSITION_EPSILON = 1e-6
/**
 * How far a surface-projected electrode is lifted clear of the scalp, in meters.
 *
 * Only enough to break the tie with the surface it sits on. A marker lifted appreciably would float visibly at the
 * silhouette, where the scalp is edge-on and the lift points across the screen rather than towards the viewer.
 */
const ANCHOR_LIFT = 0.0005

/**
 * Every baked map that ships with the package. Order does not matter: `forLabels` picks the richest map the montage
 * can feed, not the first one that fits.
 */
const BAKED: EncodedFieldMap[] = [
    FIELDMAP_1020 as EncodedFieldMap,
    FIELDMAP_IFCN25 as EncodedFieldMap,
]
/** Decoding an asset allocates a few hundred kilobytes of typed arrays, so it happens at most once per asset. */
const DECODED = new Map<EncodedFieldMap, EegSurfaceFieldMap>()

/**
 * Möller-Trumbore ray-triangle intersection.
 * @returns Distance along the ray to the intersection, or 0 when the ray misses the triangle.
 */
const rayTriangle = (
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    verts: Float32Array, a: number, b: number, c: number,
) => {
    const e1x = verts[b*3] - verts[a*3]
    const e1y = verts[b*3 + 1] - verts[a*3 + 1]
    const e1z = verts[b*3 + 2] - verts[a*3 + 2]
    const e2x = verts[c*3] - verts[a*3]
    const e2y = verts[c*3 + 1] - verts[a*3 + 1]
    const e2z = verts[c*3 + 2] - verts[a*3 + 2]
    const px = dy*e2z - dz*e2y
    const py = dz*e2x - dx*e2z
    const pz = dx*e2y - dy*e2x
    const det = e1x*px + e1y*py + e1z*pz
    // Both facings are accepted: the ray starts inside the shell, so it leaves through a back face.
    if (Math.abs(det) < 1e-12) {
        return 0
    }
    const inv = 1/det
    const tx = ox - verts[a*3], ty = oy - verts[a*3 + 1], tz = oz - verts[a*3 + 2]
    const u = (tx*px + ty*py + tz*pz)*inv
    if (u < 0 || u > 1) {
        return 0
    }
    const qx = ty*e1z - tz*e1y
    const qy = tz*e1x - tx*e1z
    const qz = tx*e1y - ty*e1x
    const v = (dx*qx + dy*qy + dz*qz)*inv
    if (v < 0 || u + v > 1) {
        return 0
    }
    const distance = (e2x*qx + e2y*qy + e2z*qz)*inv
    return distance > 0 ? distance : 0
}

/** Decode a base64 payload into raw bytes, in a browser or in Node. */
const decodeBase64 = (data: string) => {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

export default class EegSurfaceFieldMap implements EegSurfaceFieldMapInterface {
    /**
     * Find the best baked field map the given channels can feed.
     *
     * Matching is by resolved electrode position rather than by name, so a recording labelled with the pre-1991
     * temporal names is served by a map baked against the modern ones. A map is only usable when *every* one of its
     * channels is found: the mapping matrix is a pseudo-inverse over the full channel set, so columns cannot be
     * dropped, and a subset would need its own bake.
     *
     * Where several maps fit, the one with the most channels wins, because it resolves the field most finely — a
     * recording carrying the IFCN inferior temporal chain gets a map that uses it rather than one that ignores it.
     * That makes the selection a property of the recording rather than of the order the assets happen to be listed in.
     *
     * @param labels - Electrode labels of the caller's channels, in the caller's own order.
     * @returns The matching map and the index of each of its channels in `labels`, or null if none matches.
     */
    static forLabels (labels: string[]): FieldMapChannelMatch | null {
        const resolved = labels.map(label => getElectrodePosition(label))
        let best: { asset: EncodedFieldMap, indices: number[] } | null = null
        for (const asset of BAKED) {
            if (best && asset.channels.length <= best.indices.length) {
                continue
            }
            const indices: number[] = []
            for (const channel of asset.channels) {
                const target = getElectrodePosition(channel)
                if (!target) {
                    break
                }
                const index = resolved.findIndex(position => position !== null &&
                    Math.abs(position.x - target.x) < POSITION_EPSILON &&
                    Math.abs(position.y - target.y) < POSITION_EPSILON &&
                    Math.abs(position.z - target.z) < POSITION_EPSILON)
                if (index < 0) {
                    break
                }
                indices.push(index)
            }
            if (indices.length === asset.channels.length) {
                best = { asset, indices }
            }
        }
        if (!best) {
            return null
        }
        let map = DECODED.get(best.asset)
        if (!map) {
            map = new EegSurfaceFieldMap(best.asset)
            DECODED.set(best.asset, map)
        }
        return { indices: best.indices, map }
    }

    /** Lazily projected electrode positions; see `electrodeAnchors`. */
    protected _anchors: Float32Array | null = null
    protected _ao: Float32Array
    protected _channels: string[]
    protected _electrodes: Float32Array
    /** Row-major `nVertices` x `nChannels` mapping matrix. */
    protected _mapping: Float32Array
    protected _montage: string
    protected _nChannels: number
    protected _nVertices: number
    protected _normals: Float32Array
    protected _origin: Point3D
    /** Scratch buffer reused by `colors` and `isolines`. */
    protected _scratch: Float32Array
    protected _triangles: Uint16Array
    protected _vertices: Float32Array

    /**
     * Decode a baked asset.
     * @param asset - A field map as `bake_fieldmap.py` writes it.
     */
    constructor (asset: EncodedFieldMap) {
        if (asset.version !== ASSET_VERSION) {
            throw new Error(
                `Field map asset is version ${asset.version}, this build decodes version ${ASSET_VERSION}. ` +
                `Re-run tools/topography/bake_fieldmap.py.`
            )
        }
        const { nChannels, nVertices } = asset
        const bytes = (data: string) => decodeBase64(data)
        this._vertices = new Float32Array(bytes(asset.vertices).buffer)
        this._normals = new Float32Array(bytes(asset.normals).buffer)
        this._triangles = new Uint16Array(bytes(asset.triangles).buffer)
        this._electrodes = new Float32Array(bytes(asset.electrodes).buffer)
        this._mapping = new Float32Array(bytes(asset.mapping).buffer)
        this._ao = Float32Array.from(bytes(asset.ao), v => v/255)
        if (this._mapping.length !== nVertices*nChannels) {
            throw new Error(
                `Mapping matrix has ${this._mapping.length} entries, expected ` +
                `${nVertices*nChannels} (${nVertices} x ${nChannels}).`
            )
        }
        if (this._vertices.length !== nVertices*3) {
            throw new Error(`Mesh has ${this._vertices.length/3} vertices, expected ${nVertices}.`)
        }
        this._channels = asset.channels
        this._montage = asset.montage
        this._nChannels = nChannels
        this._nVertices = nVertices
        this._origin = { x: asset.origin[0], y: asset.origin[1], z: asset.origin[2] }
        this._scratch = new Float32Array(nVertices)
    }

    /**
     * Per-vertex ambient occlusion, 0 (open) to 1 (most occluded on this mesh). Baked from the static geometry, so
     * concavities such as the eye sockets and the crease beside the nose read as shadow, which a Lambert term cannot
     * produce because it only sees the local normal. Upload as a vertex attribute and darken by it, through a
     * smoothstep floor rather than linearly: occlusion is near zero over most of the scalp, so a linear ramp tints
     * everything for no benefit.
     */
    get ao () {
        return this._ao
    }
    /** Channel names in the order `interpolate` expects values. */
    get channels () {
        return this._channels
    }
    /**
     * Flat xyz electrode positions projected onto the scalp mesh, for drawing markers.
     *
     * `electrodes` holds where the montage says the electrodes are, on the idealised head that montage was defined
     * against. The mesh is a real scalp, and the two disagree by a few millimetres — enough that a third of a 10-20
     * montage, the posterior electrodes especially, sits *inside* the mesh and is hidden by it. Each position is
     * therefore moved along its own ray from the sphere origin to where that ray meets the surface, which keeps the
     * anatomical direction exactly and so keeps the marker over the field it belongs to.
     */
    get electrodeAnchors () {
        if (!this._anchors) {
            this._anchors = this._projectToSurface()
        }
        return this._anchors
    }
    /** Flat xyz electrode positions as the montage defines them (meters, head coordinates). */
    get electrodes () {
        return this._electrodes
    }
    /** Name of the montage this map was baked for. */
    get montage () {
        return this._montage
    }
    get nChannels () {
        return this._nChannels
    }
    get nVertices () {
        return this._nVertices
    }
    /** Flat xyz vertex normals. */
    get normals () {
        return this._normals
    }
    /** Sphere origin this map was baked around; hand the same one to an `EegTopogram` of the same montage. */
    get origin () {
        return this._origin
    }
    /** Flat index triples into `vertices`. */
    get triangles () {
        return this._triangles
    }
    /** Flat xyz vertex positions (meters, head coordinates). */
    get vertices () {
        return this._vertices
    }

    /**
     * Move every electrode along its ray from the sphere origin to where that ray meets the scalp mesh.
     *
     * Where a ray crosses the surface more than once — through the nose, or in and out of the neck opening — the
     * crossing nearest the electrode's own radius is taken rather than the first or the last, so a frontal electrode
     * cannot be dragged onto the nose tip. An electrode whose ray misses the mesh entirely keeps its own position;
     * that only happens below the trim, where there is no surface to sit on.
     */
    protected _projectToSurface () {
        const out = Float32Array.from(this._electrodes)
        const tris = this._triangles
        const verts = this._vertices
        const { x: ox, y: oy, z: oz } = this._origin
        for (let e = 0; e < this._nChannels; e++) {
            const ex = out[e*3] - ox, ey = out[e*3 + 1] - oy, ez = out[e*3 + 2] - oz
            const radius = Math.hypot(ex, ey, ez) || 1
            const dx = ex/radius, dy = ey/radius, dz = ez/radius
            let hit = 0
            for (let t = 0; t < tris.length; t += 3) {
                const distance = rayTriangle(ox, oy, oz, dx, dy, dz, verts, tris[t], tris[t + 1], tris[t + 2])
                if (distance > 0 && (!hit || Math.abs(distance - radius) < Math.abs(hit - radius))) {
                    hit = distance
                }
            }
            if (!hit) {
                continue
            }
            const reach = hit + ANCHOR_LIFT
            out[e*3] = ox + dx*reach
            out[e*3 + 1] = oy + dy*reach
            out[e*3 + 2] = oz + dz*reach
        }
        return out
    }

    /**
     * Symmetric limit for the colour scale, i.e. the largest absolute field value in a frame.
     * @param field - Per-vertex values from `interpolate`.
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

    /**
     * Produce per-vertex RGB colours using a diverging ramp.
     *
     * @param values - One value per channel, in `channels` order.
     * @param out - Optional reusable buffer of `nVertices * 3` floats in the range 0..1.
     * @param limit - Value mapped to full saturation; defaults to the frame maximum.
     * @param ramp - Colour ramp; defaults to the shared default.
     */
    colors (
        values: ArrayLike<number>,
        out?: Float32Array,
        limit?: number,
        ramp: DivergingRamp = DEFAULT_DIVERGING_RAMP,
    ) {
        const field = this.interpolate(values, this._scratch)
        const lim = limit ?? EegSurfaceFieldMap.limitOf(field)
        const scale = lim > 0 ? 1/lim : 0
        const dst = out ?? new Float32Array(field.length*3)
        const rgb = new Float32Array(3)
        for (let i = 0, o = 0; i < field.length; i++, o += 3) {
            sampleRamp(field[i]*scale, ramp, rgb)
            dst[o] = rgb[0] ; dst[o + 1] = rgb[1] ; dst[o + 2] = rgb[2]
        }
        return dst
    }

    /**
     * Project one frame of electrode voltages onto every surface vertex.
     * @param values - One value per channel, in `channels` order.
     * @param out - Optional reusable buffer of `nVertices` floats.
     */
    interpolate (values: ArrayLike<number>, out?: Float32Array) {
        const nChannels = this._nChannels
        const dst = out ?? new Float32Array(this._nVertices)
        const m = this._mapping
        for (let v = 0, k = 0; v < this._nVertices; v++, k += nChannels) {
            let sum = 0
            for (let c = 0; c < nChannels; c++) {
                sum += m[k + c]*values[c]
            }
            dst[v] = sum
        }
        return dst
    }

    /**
     * Extract field contours by marching triangles. Each triangle contributes at most one segment per level, so the
     * result is an unordered soup of segments, which is what `GL_LINES` wants anyway.
     *
     * Contour points lie exactly *on* the scalp, so a depth-tested renderer z-fights with the surface. The reliable
     * remedy is a constant depth bias applied to the mesh in its vertex shader; `gl.polygonOffset` behaves differently
     * across rasterisers. Where neither is available, `offset` lifts each point along the interpolated surface normal.
     * Never substitute a uniform scale about the mesh centre: a head is not a sphere, so that lifts the crown and
     * buries the rest.
     *
     * Levels come from `EegTopogram.levels`, so a 2D topogram and this map drawn from the same frame show the same
     * isopotentials.
     *
     * @param values - One value per channel, in `channels` order.
     * @param nLevels - Number of contour levels either side of zero.
     * @param limit - Outermost contour value; defaults to the frame maximum.
     * @param offset - Optional lift along the surface normal, in meters. Defaults to 0, i.e. points sit exactly on the scalp.
     */
    isolines (
        values: ArrayLike<number>,
        nLevels = 5,
        limit?: number,
        offset = 0,
    ): Isoline3D[] {
        const field = this.interpolate(values, this._scratch)
        const lim = limit ?? EegSurfaceFieldMap.limitOf(field)
        if (lim <= 0) {
            return []
        }
        const tris = this._triangles
        const verts = this._vertices
        const nrms = this._normals
        const out: Isoline3D[] = []
        for (const level of EegTopogram.levels(lim, nLevels)) {
            const pts: number[] = []
            for (let t = 0; t < tris.length; t += 3) {
                const a = tris[t], b = tris[t + 1], c = tris[t + 2]
                const fa = field[a] - level, fb = field[b] - level, fc = field[c] - level
                const hits: number[] = []
                const edge = (i: number, j: number, fi: number, fj: number) => {
                    if ((fi < 0) === (fj < 0)) {
                        return
                    }
                    const w = fi/(fi - fj)
                    let nx = nrms[i*3] + w*(nrms[j*3] - nrms[i*3])
                    let ny = nrms[i*3 + 1] + w*(nrms[j*3 + 1] - nrms[i*3 + 1])
                    let nz = nrms[i*3 + 2] + w*(nrms[j*3 + 2] - nrms[i*3 + 2])
                    const len = Math.hypot(nx, ny, nz) || 1
                    nx = nx/len*offset ; ny = ny/len*offset ; nz = nz/len*offset
                    hits.push(
                        verts[i*3] + w*(verts[j*3] - verts[i*3]) + nx,
                        verts[i*3 + 1] + w*(verts[j*3 + 1] - verts[i*3 + 1]) + ny,
                        verts[i*3 + 2] + w*(verts[j*3 + 2] - verts[i*3 + 2]) + nz,
                    )
                }
                edge(a, b, fa, fb)
                edge(b, c, fb, fc)
                edge(c, a, fc, fa)
                if (hits.length === 6) {
                    pts.push(...hits)
                }
            }
            if (pts.length) {
                out.push({ level, points: Float32Array.from(pts) })
            }
        }
        return out
    }

    /**
     * Reorder an app-supplied value array into the order the mapping matrix expects.
     * @param values - Values keyed by channel name.
     * @returns The reordered values, or null if any required channel is absent.
     */
    orderValues (values: Record<string, number>) {
        const out = new Float32Array(this._nChannels)
        for (let i = 0; i < this._nChannels; i++) {
            const v = values[this._channels[i]]
            if (v === undefined) {
                return null
            }
            out[i] = v
        }
        return out
    }
}
