#!/usr/bin/env python3
"""
Dump standard electrode positions into the JSON table the 2D topogram reads at runtime.

The spherical-spline topogram needs a 3D position per electrode, and needs it in the same frame the
baked surface field map was built in — MNE *head* coordinates, i.e. after the montage's fiducials
have been applied. ``montage.get_positions()['ch_pos']`` is in the montage's own frame and is
therefore the wrong source; the positions here come from ``info['chs'][i]['loc'][:3]`` after
``set_montage``, which is what ``bake_fieldmap.py`` also uses.

``standard_1005`` is the superset montage: it carries every 10-20, 10-10 and 10-05 label, including
the pre-1991 temporal names (T3/T4/T5/T6) at positions identical to their modern equivalents
(T7/T8/P7/P8), so no alias table is needed downstream.

Usage
-----
    python dump_electrodes.py --out ../../src/config/topography/electrodes-1005.json

@license Apache-2.0
"""

import argparse
import json
from pathlib import Path

import numpy as np
import mne

mne.set_log_level("error")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--montage", default="standard_1005")
    ap.add_argument("--out", default="electrodes-1005.json")
    args = ap.parse_args()

    montage = mne.channels.make_standard_montage(args.montage)
    names = list(montage.ch_names)
    info = mne.create_info(names, 250.0, "eeg")
    info.set_montage(montage)

    positions = {}
    for name, ch in zip(names, info["chs"]):
        loc = np.asarray(ch["loc"][:3], float)
        if not np.isfinite(loc).all() or not np.any(loc):
            continue
        # Keys are upper-cased so the runtime lookup can be case-insensitive: recording labels use
        # every casing in the wild (Fp1, FP1, fp1) and none of them is more correct than the others.
        positions[name.upper()] = [round(float(v), 6) for v in loc]

    out = {
        "montage": args.montage,
        # See the package NOTICE; provenance stays with the data rather than only beside it.
        "attribution": {
            "generatedBy": "tools/topography/dump_electrodes.py",
            "positions": ("standard_1005 montage from MNE-Python (BSD-3-Clause), "
                          "https://github.com/mne-tools/mne-python"),
            "notice": "See NOTICE in the root of @epicurrents/eeg-module.",
        },
        "space": "head",
        "unit": "m",
        "positions": positions,
    }
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fid:
        json.dump(out, fid, indent=0)
    print(f"wrote {path} with {len(positions)} positions "
          f"({path.stat().st_size/1024:.0f} KiB)")


if __name__ == "__main__":
    main()
