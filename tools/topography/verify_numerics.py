#!/usr/bin/env python3
"""
Check the topography sources against MNE-Python on identical input.

This is the test that matters for the interpolation paths: everything else is presentation. Run it
after any change to `EegTopogram`, `EegSurfaceFieldMap` or `electrodes.ts`, and after regenerating
either asset. The vitest suite guards the same code against a stored fixture, which is fast but only
detects drift from the fixture; this compares against MNE itself.

Expected: 2D ~1.2e-7, 3D ~7.0e-8. Both figures are float32 storage of an operator, not an
approximation of the method — a relative error above 1e-5 is a real regression.

    pip install mne
    python verify_numerics.py

The sources are bundled with esbuild, which is what resolves the `#config` alias and inlines the
JSON assets, exactly as the application bundler does. Set ESBUILD to a binary path to skip npx.

@license Apache-2.0
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import mne
from mne.channels.interpolation import _make_interpolation_matrix
from mne.forward._field_interpolation import _make_surface_mapping
from mne.transforms import _get_trans, transform_surface_to

mne.set_log_level("error")

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent.parent
FSAVERAGE = Path(mne.__file__).parent / "data" / "fsaverage"
RES = 200
# The 19 channels the shipped map is baked for, and the pre-1991 names for four of them. Feeding the
# old names exercises the position-based channel matching in `EegSurfaceFieldMap.forLabels`.
PICKS = "Fp1,Fp2,F7,F3,Fz,F4,F8,T7,C3,Cz,C4,T8,P7,P3,Pz,P4,P8,O1,O2".split(",")
# The IFCN standardized array: the 19 above plus the inferior temporal chain (Seeck et al. 2017).
IFCN = PICKS + ["F9", "F10", "T9", "T10", "P9", "P10"]
LEGACY = {"T7": "T3", "T8": "T4", "P7": "T5", "P8": "T6"}
TRIM_Z = -0.06


def bundle(target):
    """Bundle the topography barrel into a single ESM file node can import."""
    esbuild = os.environ.get("ESBUILD")
    command = [esbuild] if esbuild else ["npx", "--yes", "esbuild"]
    command += [
        str(PACKAGE / "src/topography/index.ts"),
        "--bundle", "--format=esm", "--platform=node", f"--outfile={target}",
        f"--alias:#types={PACKAGE / 'src/types'}",
        f"--alias:#config={PACKAGE / 'src/config'}",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"bundling failed:\n{result.stderr}")


def run_node(script):
    result = subprocess.run(["node", "--input-type=module", "-e", script],
                            capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"node failed:\n{result.stderr}")
    return result.stdout


def build_info(picks):
    info = mne.create_info(list(picks), 250.0, "eeg")
    info.set_montage(mne.channels.make_standard_montage("standard_1005"))
    return mne.io.RawArray(np.zeros((len(picks), 2)), info, verbose=False) \
                 .set_eeg_reference("average", projection=True, verbose=False).info


def check_positions(bundle_path):
    """The shipped position table must be MNE head coordinates, including the legacy names."""
    out = run_node(f"""
        import {{ getElectrodePosition }} from '{bundle_path}';
        const names = {json.dumps(PICKS + list(LEGACY.values()))};
        console.log(JSON.stringify(names.map(n => {{
            const p = getElectrodePosition(n);
            return p ? [p.x, p.y, p.z] : null;
        }})));
    """)
    got = np.array(json.loads(out))
    info = build_info(PICKS)
    reference = np.array([ch["loc"][:3] for ch in info["chs"]])
    # The legacy names must land on their modern equivalents to the bit, or the field map's
    # position-based channel matching silently fails on an old recording.
    legacy = np.array([reference[PICKS.index(modern)] for modern in LEGACY])
    expected = np.vstack([reference, legacy])
    return np.abs(expected - got).max()


def check_2d(bundle_path):
    """Spherical spline: EegTopogram vs mne.channels.interpolation._make_interpolation_matrix."""
    rng = np.random.default_rng(20260816)
    info = build_info(PICKS)
    positions = np.array([ch["loc"][:3] for ch in info["chs"]])
    values = rng.normal(size=len(PICKS))*5e-5

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fid:
        json.dump({"positions": positions.tolist(), "values": values.tolist()}, fid)
        input_path = fid.name
    output_path = input_path.replace(".json", "-out.json")
    run_node(f"""
        import {{ EegTopogram }} from '{bundle_path}';
        import fs from 'fs';
        const d = JSON.parse(fs.readFileSync('{input_path}','utf8'));

        // The MNE reference below centres on the centroid, so the centroid is passed explicitly
        // rather than letting the constructor fit a sphere, which is what the app gets.
        const p = d.positions.map(([x,y,z])=>({{x,y,z}}));
        const c = {{
            x: p.reduce((s,q)=>s+q.x,0)/p.length,
            y: p.reduce((s,q)=>s+q.y,0)/p.length,
            z: p.reduce((s,q)=>s+q.z,0)/p.length,
        }};
        const t = new EegTopogram(p, {RES}, c);
        fs.writeFileSync('{output_path}',
            JSON.stringify(Array.from(t.interpolate(Float32Array.from(d.values)))));
    """)

    # The same grid and inverse projection the constructor uses (row 0 = +y, nose up).
    gx = 2*(np.arange(RES) + 0.5)/RES - 1
    gy = 1 - 2*(np.arange(RES) + 0.5)/RES
    GX, GY = np.meshgrid(gx, gy)
    rad = np.hypot(GX, GY)
    inside = rad <= 1
    pol, az = rad*np.pi/2, np.arctan2(GY, GX)
    to = np.c_[(np.sin(pol)*np.cos(az)).ravel(),
               (np.sin(pol)*np.sin(az)).ravel(),
               np.cos(pol).ravel()]
    ref = (_make_interpolation_matrix(positions - positions.mean(0), to.copy()) @ values).reshape(RES, RES)
    got = np.array(json.load(open(output_path))).reshape(RES, RES)
    return np.abs(ref[inside] - got[inside]).max()/np.abs(ref[inside]).max()


def check_3d(bundle_path, picks):
    """Surface field map: the shipped asset vs a fresh mne _make_surface_mapping.

    The channels are handed over under their legacy names and in a deliberately different order from
    the bake, so a pass also proves that `forLabels` matched by position and reindexed correctly, and
    that it picked the asset baked for exactly this channel set.
    """
    rng = np.random.default_rng(20260817)
    values = rng.normal(size=len(picks))*5e-5
    labels = [LEGACY.get(name, name) for name in picks][::-1]
    shuffled = values[::-1]

    output_path = tempfile.mktemp(suffix=".json")
    run_node(f"""
        import {{ EegSurfaceFieldMap }} from '{bundle_path}';
        import fs from 'fs';
        const labels = {json.dumps(labels)};
        const values = {json.dumps(shuffled.tolist())};
        const match = EegSurfaceFieldMap.forLabels(labels);
        if (!match) {{ throw new Error('no field map matched ' + labels.join(',')) }}
        if (match.map.channels.length !== labels.length) {{
            throw new Error(`matched a ${{match.map.channels.length}}-channel map for ${{labels.length}} labels`)
        }}
        const ordered = Float32Array.from(match.indices.map(i => values[i]));
        fs.writeFileSync('{output_path}',
            JSON.stringify(Array.from(match.map.interpolate(ordered))));
    """)

    info = build_info(picks)
    surf = mne.read_bem_surfaces(FSAVERAGE / "fsaverage-head.fif")[0]
    surf = transform_surface_to(
        surf, "head", _get_trans(str(FSAVERAGE / "fsaverage-trans.fif"), "head", "mri")[0],
        copy=True)
    mapping = _make_surface_mapping(
        info, surf, "eeg", mode="accurate", origin=mne.bem._check_origin("auto", info))["data"]
    keep = surf["rr"][:, 2] >= TRIM_Z
    ref = mapping[keep] @ values
    got = np.array(json.load(open(output_path)))
    if ref.shape != got.shape:
        sys.exit(f"vertex count mismatch: MNE {ref.shape} vs asset {got.shape}. "
                 f"Re-bake, or check TRIM_Z here matches the bake's --trim-z.")
    return np.abs(ref - got).max()/np.abs(ref).max()


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        bundle_path = Path(tmp) / "topography.mjs"
        bundle(bundle_path)
        as_url = bundle_path.as_posix()
        positions = check_positions(as_url)
        e2 = check_2d(as_url)
        e3 = {"10-20 (19 ch)": check_3d(as_url, PICKS), "IFCN (25 ch)": check_3d(as_url, IFCN)}
    print(f"electrode table vs MNE   : {positions:.2e} m  (expect < 1e-6, the stored rounding)")
    print(f"EegTopogram vs MNE       : {e2:.2e}     (expect ~1.2e-7)")
    for name, error in e3.items():
        print(f"  field map {name:15s}: {error:.2e}     (expect ~7.0e-8)")
    ok = positions < 1e-6 and e2 < 1e-5 and all(error < 1e-5 for error in e3.values())
    print("PASS" if ok else "FAIL — an error above the stated tolerance means a real regression")
    sys.exit(0 if ok else 1)
