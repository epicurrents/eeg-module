/**
 * Epicurrents EEG topography types.
 * @package    epicurrents/eeg-module
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

/** A point in MNE head coordinates, in meters. */
export type Point3D = { x: number, y: number, z: number }

/** An RGB triple with components in the range 0..1. */
export type Rgb = readonly [number, number, number]

/**
 * A diverging colour ramp: two poles, a neutral midpoint, and the curve between them.
 */
export type DivergingRamp = {
    /** Colour at the most negative value. */
    negative: Rgb
    /** Colour at zero. Keep this neutral, as a hue here reads as a third category. */
    neutral: Rgb
    /** Colour at the most positive value. */
    positive: Rgb
    /**
     * Saturation curve exponent, 0.3 (vivid) to 1 (linear).
     *
     * A field is dominated by values well below its peak, so a linear ramp renders most of the scalp near-neutral and
     * reads as washed out. Values below 1 push the mid range towards the poles without altering the underlying data.
     */
    gamma: number
}

/** A contour level and its segments, as flat xy pairs in grid pixel coordinates. */
export type Isoline2D = { level: number, points: Float32Array }

/** A contour level and its segments, as flat xyz triples in head coordinates. */
export type Isoline3D = { level: number, points: Float32Array }

/**
 * A baked surface field map as it is stored on disk.
 *
 * Every numeric array is base64 of little-endian binary, in the fixed per-field layout each property documents.
 * Nothing in the file describes those layouts, so the writer and the reader hold the same table independently:
 * `tools/topography/bake_fieldmap.py` is the writer, `EegSurfaceFieldMap` the reader, and `version` is what stops
 * the two from silently drifting apart. Changing any field's dtype or element order means bumping it.
 *
 * Base64 of packed binary rather than JSON number arrays because it is a little over a third of the size, and one
 * self-contained file rather than a sidecar because it is then importable by the package build with no copy step and
 * no runtime fetch.
 */
export type EncodedFieldMap = {
    /** Layout version; a decoder rejects anything it does not recognise. */
    version: number
    /** Channel names, in the order the mapping matrix expects them. */
    channels: string[]
    /** Name of the montage the map was baked for. */
    montage: string
    /** Legendre expansion quality used offline. */
    mode: string
    /** Number of mesh vertices, i.e. the row count of `mapping` and the length of `ao`. */
    nVertices: number
    /** Number of channels, i.e. the column count of `mapping` and the length of `channels`. */
    nChannels: number
    /** Sphere origin in head coordinates (meters). */
    origin: number[]
    /** Vertex positions: float32, `nVertices` xyz triples, in meters in head coordinates. */
    vertices: string
    /** Vertex normals: float32, `nVertices` xyz triples, unit length. */
    normals: string
    /**
     * Per-vertex ambient occlusion: uint8, `nVertices` values, `0`..`255` for an occlusion of 0..1.
     *
     * Eight bits because it is only ever read through a smoothstep as a shading weight, which is far coarser than the
     * quantisation; float32 would quadruple the field for nothing visible.
     */
    ao: string
    /**
     * Triangles: uint16, index triples into `vertices`.
     *
     * Uint16 caps a mesh at 65535 vertices, which the baker checks rather than letting the indices wrap.
     */
    triangles: string
    /** Electrode positions: float32, `nChannels` xyz triples, in meters in head coordinates, in `channels` order. */
    electrodes: string
    /**
     * The mapping matrix: float32, row-major `nVertices` x `nChannels`, so `field = mapping @ data`.
     *
     * Float32 rather than a narrower quantisation because this is the whole numerical content of the asset, and it is
     * what holds agreement with MNE-Python to ~1e-7 relative. It also dominates the file, at four bytes per vertex per
     * channel.
     */
    mapping: string
}

/**
 * A baked field map together with the positions of its channels in a caller's own channel list.
 */
export type FieldMapChannelMatch = {
    /** Index into the caller's label array for each baked channel, in baked channel order. */
    indices: number[]
    /** The field map those indices feed. */
    map: EegSurfaceFieldMapInterface
}

/**
 * Scalp surface field map driven by a precomputed MNE mapping matrix.
 */
export interface EegSurfaceFieldMapInterface {
    /** Per-vertex ambient occlusion, 0 (open) to 1 (most occluded on this mesh). */
    ao: Float32Array
    /** Channel names in the order `interpolate` expects values. */
    channels: string[]
    /**
     * Flat xyz electrode positions projected onto the scalp mesh, for drawing markers that are not buried in it.
     *
     * Optional so that a consumer built against a newer version of this package still runs against an older build of
     * it, falling back to `electrodes`, rather than failing at construction.
     */
    electrodeAnchors?: Float32Array
    /** Flat xyz electrode positions as the montage defines them (meters, head coordinates). */
    electrodes: Float32Array
    /** Name of the montage this map was baked for. */
    montage: string
    /** Flat xyz vertex normals. */
    normals: Float32Array
    /** Sphere origin the map was baked around; hand the same one to a `EegTopogram` of the same montage. */
    origin: Point3D
    /** Flat index triples into `vertices`. */
    triangles: Uint16Array
    /** Flat xyz vertex positions (meters, head coordinates). */
    vertices: Float32Array
    /**
     * Produce per-vertex RGB colours using a diverging ramp.
     * @param values - One value per channel, in `channels` order.
     * @param out - Optional reusable buffer of `nVertices * 3` floats in the range 0..1.
     * @param limit - Value mapped to full saturation; defaults to the frame maximum.
     * @param ramp - Colour ramp; defaults to the shared default.
     */
    colors (values: ArrayLike<number>, out?: Float32Array, limit?: number, ramp?: DivergingRamp): Float32Array
    /**
     * Project one frame of electrode voltages onto every surface vertex.
     * @param values - One value per channel, in `channels` order.
     * @param out - Optional reusable buffer of `nVertices` floats.
     */
    interpolate (values: ArrayLike<number>, out?: Float32Array): Float32Array
    /**
     * Extract field contours by marching triangles.
     * @param values - One value per channel, in `channels` order.
     * @param nLevels - Number of contour levels either side of zero.
     * @param limit - Outermost contour value; defaults to the frame maximum.
     * @param offset - Optional lift along the surface normal, in meters.
     */
    isolines (values: ArrayLike<number>, nLevels?: number, limit?: number, offset?: number): Isoline3D[]
    /**
     * Reorder an app-supplied value array into the order the mapping matrix expects.
     * @param values - Values keyed by channel name.
     * @returns The reordered values, or null if any required channel is absent.
     */
    orderValues (values: Record<string, number>): Float32Array | null
}

/**
 * Precomputed spherical-spline topogram for a fixed electrode montage.
 */
export interface EegTopogramInterface {
    /** True for grid pixels inside the head circle. */
    mask: Uint8Array
    /** Center of the fitted head sphere, in head coordinates. */
    origin: Point3D
    /** Electrode positions in head coordinates, in the order values are supplied. */
    positions: Point3D[]
    /** Side length of the square output grid in pixels. */
    resolution: number
    /**
     * Where to draw a marker for every electrode, in the order values are supplied.
     *
     * These are layout positions and not simply `project` applied to each electrode; the implementation explains how
     * the two differ and why.
     */
    electrodePixels (): { radius: number, x: number, y: number }[]
    /**
     * Interpolate one frame of channel values onto the grid.
     * @param values - One voltage per electrode, in montage order.
     * @param out - Optional reusable output buffer of `resolution^2` floats.
     */
    interpolate (values: ArrayLike<number>, out?: Float32Array): Float32Array
    /**
     * Extract field contours by marching squares, in grid pixel coordinates.
     * @param values - One voltage per electrode, in montage order.
     * @param nLevels - Number of contour levels either side of zero.
     * @param limit - Outermost contour value; defaults to the frame maximum.
     */
    isolines (values: ArrayLike<number>, nLevels?: number, limit?: number): Isoline2D[]
    /**
     * Project a point in head coordinates onto the grid, using the forward of the projection the operator inverts.
     * @param point - Position in head coordinates, in meters.
     * @returns Pixel coordinates on the grid, and the projected radius, where 1 is the head circle.
     */
    project (point: Point3D): { radius: number, x: number, y: number }
    /**
     * Interpolate and write straight into an RGBA buffer using a diverging ramp.
     * @param values - One voltage per electrode, in montage order.
     * @param rgba - Destination, e.g. `ImageData.data` of a `resolution` x `resolution` canvas.
     * @param limit - Value mapped to full saturation; defaults to the frame maximum.
     * @param ramp - Colour ramp; defaults to the shared default.
     */
    toRgba (
        values: ArrayLike<number>,
        rgba: Uint8ClampedArray,
        limit?: number,
        ramp?: DivergingRamp
    ): Uint8ClampedArray
}
