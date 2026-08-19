#!/usr/bin/env python3
"""
Bake an MNE EEG surface field map into a browser-loadable asset.

This is the *offline* half of the 3D voltage field topogram. Everything MNE is needed for happens
here, once per montage. The output is a mesh plus a dense mapping matrix; at runtime the browser
only evaluates ``field = mapping @ data``, which needs no Python, no numpy and no MNE.

The scalp surface is ``fsaverage-head.fif``, which ships inside the mne package itself (~98 KB), so
no dataset download is required.

Four things will silently produce a wrong asset if changed:

* The average-reference projector must be on the ``Info`` before baking. ``_compute_mapping_matrix``
  only subtracts the channel mean when ``_has_eeg_average_ref_proj`` is true; without it the baked
  map is not reference-consistent with the signals the app displays.
* Trim at ``z >= -0.06`` m in head coordinates. That lands just below the eye sockets (which span
  z -0.049..+0.008), keeping brow, sockets and nose as orientation landmarks while discarding the
  jaw and neck. Raising it to -0.035 loses the whole face.
* The sphere origin is emitted with the asset and must be handed to the 2D ``Topogram`` as well, or
  the two views disagree about where the head is centred.
* EEG and MEG take different pseudo-inverse paths (EEG Tikhonov, MEG truncated SVD). Only the EEG
  path is exercised here.

Usage
-----
    python bake_fieldmap.py --channels Fp1,Fp2,... --out ../../src/config/topography/fieldmap-1020.json

Outputs a single self-contained JSON: metadata plus every numeric array base64-encoded in the fixed
layout ``ASSET_VERSION`` describes. One file keeps the asset importable by the package build with no
copy step and no runtime fetch, and base64 of packed binary is smaller than the equivalent JSON
number list.

@license Apache-2.0
"""

import argparse
import base64
import json
from pathlib import Path

import numpy as np
import mne
from mne.forward._field_interpolation import _make_surface_mapping
from mne.transforms import _get_trans, transform_surface_to

mne.set_log_level("error")

FSAVERAGE = Path(mne.__file__).parent / "data" / "fsaverage"
DEFAULT_1020 = ("Fp1,Fp2,F7,F3,Fz,F4,F8,T7,C3,Cz,C4,T8,P7,P3,Pz,P4,P8,O1,O2")

# Bumped whenever the binary layout below changes. SurfaceFieldMap refuses an asset it does not
# recognise rather than decoding a matrix into the wrong shape.
ASSET_VERSION = 1
# Fixed little-endian layout of the base64 payloads. The decoder hard-codes the same table.
LAYOUT = {
    "vertices": "<f4",
    "normals": "<f4",
    "ao": "u1",
    "triangles": "<u2",
    "electrodes": "<f4",
    "mapping": "<f4",
}


def build_info(channels, montage_name="standard_1020", sfreq=250.0):
    """Create an average-referenced EEG Info carrying real electrode positions."""
    montage = mne.channels.make_standard_montage(montage_name)
    missing = [c for c in channels if c not in montage.ch_names]
    if missing:
        raise SystemExit(f"channels not in montage {montage_name}: {missing}")
    info = mne.create_info(list(channels), sfreq, "eeg")
    info.set_montage(montage)
    # The average-reference projector must be present, or the baked map will not be
    # reference-consistent with what the app displays.
    raw = mne.io.RawArray(np.zeros((len(channels), 2)), info, verbose=False)
    raw.set_eeg_reference("average", projection=True, verbose=False)
    return raw.info


def load_scalp_surface():
    """Load the fsaverage head surface bundled with MNE and move it into head coordinates."""
    surf = mne.read_bem_surfaces(FSAVERAGE / "fsaverage-head.fif")[0]
    trans = _get_trans(str(FSAVERAGE / "fsaverage-trans.fif"), "head", "mri")[0]
    surf = transform_surface_to(surf, "head", trans, copy=True)
    return surf


def ambient_occlusion(rr, nn, radius=0.035):
    """Per-vertex ambient occlusion for a static mesh.

    For each vertex, measure how much nearby geometry sits inside its normal hemisphere. Concave
    regions — eye sockets, the crease beside the nose, under the brow — are surrounded by surface
    that faces them, so they occlude heavily; convex regions like the nose tip barely occlude.

    A plain Lambert term cannot produce these shadows, because it only knows the local normal. Since
    the scalp mesh never changes, this is worth computing once here rather than in the browser.

    Returns
    -------
    ao : array, shape (n_vertices,)
        0 = fully open, 1 = most occluded vertex on this mesh.
    """
    from scipy.spatial import cKDTree

    tree = cKDTree(rr)
    ao = np.zeros(len(rr))
    for i, (p, n) in enumerate(zip(rr, nn)):
        idx = tree.query_ball_point(p, radius)
        if len(idx) < 4:
            continue
        d = rr[idx] - p
        dist = np.linalg.norm(d, axis=1)
        keep = dist > 1e-9
        d, dist = d[keep], dist[keep]
        if not len(d):
            continue
        # cosine to the normal, weighted so near neighbours occlude more than distant ones
        cos = np.clip((d @ n)/dist, 0.0, None)
        ao[i] = (cos*(1.0 - dist/radius)).sum()/len(d)
    if ao.max() > 0:
        ao /= ao.max()
    return ao


def smooth_over_mesh(values, tris, n_vertices, iterations=3):
    """Laplacian-smooth a per-vertex scalar over the mesh edges.

    The raw occlusion estimate is a neighbour count, so it inherits the mesh's local vertex density
    and comes out speckled. A few averaging passes over edge-connected neighbours remove that
    without blurring away the large concavities.
    """
    edges = np.vstack([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    edges = np.vstack([edges, edges[:, ::-1]])
    out = values.astype(float).copy()
    counts = np.bincount(edges[:, 0], minlength=n_vertices).astype(float)
    counts[counts == 0] = 1.0
    for _ in range(iterations):
        summed = np.bincount(edges[:, 0], weights=out[edges[:, 1]], minlength=n_vertices)
        out = 0.35*out + 0.65*(summed/counts)
    return out


def trim_below(surf, mapping, z_min):
    """Drop vertices below `z_min` (neck/jaw) and re-index the triangles."""
    keep = surf["rr"][:, 2] >= z_min
    if keep.all():
        return surf["rr"], surf["nn"], surf["tris"], mapping
    remap = -np.ones(len(keep), int)
    remap[keep] = np.arange(keep.sum())
    tris = surf["tris"][keep[surf["tris"]].all(axis=1)]
    return surf["rr"][keep], surf["nn"][keep], remap[tris], mapping[keep]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channels", default=DEFAULT_1020,
                    help="comma-separated channel names, in the order the app will supply them")
    ap.add_argument("--montage", default="standard_1020")
    ap.add_argument("--mode", default="accurate", choices=["fast", "accurate"],
                    help="Legendre expansion quality; 'accurate' is affordable offline")
    ap.add_argument("--trim-z", type=float, default=-0.06,
                    help="drop surface vertices below this z in metres. The default cuts just "
                         "below the eye sockets (which span z -0.049..+0.008 in head coordinates): "
                         "brow, sockets and nose survive as orientation landmarks, while the jaw "
                         "and neck — irrelevant to EEG source mapping — are discarded. Use a large "
                         "negative value to keep the whole head.")
    ap.add_argument("--out", default="fieldmap.json")
    args = ap.parse_args()

    channels = [c.strip() for c in args.channels.split(",") if c.strip()]
    info = build_info(channels, args.montage)
    surf = load_scalp_surface()

    origin = mne.bem._check_origin("auto", info)
    print(f"sphere origin (head coords, m): {np.round(origin, 4)}")
    print(f"surface: {len(surf['rr'])} vertices, {len(surf['tris'])} triangles")

    fmd = _make_surface_mapping(info, surf, "eeg", mode=args.mode, origin=origin)
    mapping = fmd["data"]                      # (n_vertices, n_channels)
    assert mapping.shape == (len(surf["rr"]), len(channels)), mapping.shape

    rr, nn, tris, mapping = trim_below(surf, mapping, args.trim_z)
    print(f"after trim: {len(rr)} vertices, {len(tris)} triangles")

    ao = smooth_over_mesh(ambient_occlusion(rr, nn), tris, len(rr))
    if ao.max() > 0:
        ao /= ao.max()
    print(f"ambient occlusion: mean {ao.mean():.3f}, p95 {np.percentile(ao, 95):.3f}")

    # Electrode positions, for drawing markers on the mesh.
    elec = np.array([ch["loc"][:3] for ch in info["chs"]])

    if len(rr) > np.iinfo(np.uint16).max:
        raise SystemExit(f"{len(rr)} vertices exceeds the uint16 triangle index layout")

    def pack(values, key):
        return base64.b64encode(np.ascontiguousarray(values).astype(LAYOUT[key]).tobytes()).decode()

    meta = {
        "version": ASSET_VERSION,
        # Provenance travels inside the asset, because the asset is the thing that gets copied around and the mesh
        # in it carries licence conditions of its own. See the package NOTICE.
        "attribution": {
            "generatedBy": "tools/topography/bake_fieldmap.py",
            # The mesh is trimmed and given an occlusion term above, so it is a *modified* version of the
            # FreeSurfer surface, and its licence requires modified versions to say so.
            "mesh": ("modified fsaverage scalp surface (FreeSurfer Software License), via the mne package: "
                     f"trimmed to vertices with z >= {args.trim_z} m in head coordinates and given a per-vertex "
                     "ambient occlusion term the original does not carry, so this is not the original surface; "
                     "see https://surfer.nmr.mgh.harvard.edu/fswiki/FreeSurferSoftwareLicense"),
            "mapping": "computed with MNE-Python (BSD-3-Clause), https://github.com/mne-tools/mne-python",
            "notice": "See NOTICE in the root of @epicurrents/eeg-module.",
        },
        "channels": channels,
        "montage": args.montage,
        "mode": args.mode,
        "nVertices": int(len(rr)),
        "nChannels": int(len(channels)),
        "origin": [float(v) for v in origin],
        "note": "field = mapping @ data; arrays are base64 of little-endian binary, see LAYOUT",
        "vertices": pack(rr.ravel(), "vertices"),
        "normals": pack(nn.ravel(), "normals"),
        # Occlusion is a shading weight read through a smoothstep, so 8 bits is well past what the
        # eye can resolve and saves three quarters of its footprint.
        "ao": pack(np.round(ao*255), "ao"),
        "triangles": pack(tris.ravel(), "triangles"),
        "electrodes": pack(elec.ravel(), "electrodes"),
        "mapping": pack(mapping.ravel(), "mapping"),
    }
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fid:
        json.dump(meta, fid)

    print(f"wrote {path} ({path.stat().st_size/1024:.0f} KiB)")


if __name__ == "__main__":
    main()
