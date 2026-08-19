# Topography assets

Offline tooling for the scalp topography sources in `src/topography/`. Nothing here runs in the browser or in the package build — it regenerates the two JSON assets under `src/config/topography/`, which are then imported like any other config file and copied to `dist/` by `copy-json.js`.

The assets these produce carry third-party material and are covered by the package `NOTICE`: the mapping matrices are computed with MNE-Python (BSD-3-Clause), and the scalp mesh is a modified version of the FreeSurfer fsaverage head surface — trimmed at `--trim-z` and carrying an ambient occlusion term the original does not — whose licence requires that its text accompany copies and that modifications like those be identified as such. Each generated file repeats its own provenance in an `attribution` field, so it stays attributable once copied out of the repository.

MNE is needed only here. At runtime the 2D topogram evaluates a spherical spline it builds itself, and the 3D field map evaluates `field = mapping @ data` against a matrix baked below, so neither needs Pyodide, numpy or MNE.

```sh
pip install mne
```

## `dump_electrodes.py` → `src/config/topography/electrodes-1005.json`

Every 10-20, 10-10 and 10-05 electrode position, in MNE **head** coordinates. Positions come from `info['chs'][i]['loc'][:3]` after `set_montage`, not from `montage.get_positions()`, which is in the montage's own frame and would silently disagree with the baked field maps.

```sh
python dump_electrodes.py --out ../../src/config/topography/electrodes-1005.json
```

## `bake_fieldmap.py` → `src/config/topography/fieldmap-*.json`

One scalp mesh plus one dense mapping matrix per montage, about three seconds per run. The scalp surface is `fsaverage-head.fif`, which ships inside the mne package, so no dataset download is required.

Two assets ship today. The 10-20 map covers the classic 19-electrode array, and the IFCN map covers the standardized array of Seeck et al. (2017), which adds the inferior temporal chain — F9/F10, T9/T10, P9/P10 — to those 19:

```sh
python bake_fieldmap.py \
    --channels Fp1,Fp2,F7,F3,Fz,F4,F8,T7,C3,Cz,C4,T8,P7,P3,Pz,P4,P8,O1,O2 \
    --montage standard_1005 --out ../../src/config/topography/fieldmap-1020.json
python bake_fieldmap.py \
    --channels Fp1,Fp2,F7,F3,Fz,F4,F8,T7,C3,Cz,C4,T8,P7,P3,Pz,P4,P8,O1,O2,F9,F10,T9,T10,P9,P10 \
    --montage standard_1005 --out ../../src/config/topography/fieldmap-ifcn25.json
```

A new asset must be added to the `BAKED` list in `EegSurfaceFieldMap.ts` before `forLabels` will find it, but the order of that list carries no meaning: a recording gets the map with the most channels it can feed, so adding a denser one automatically takes precedence wherever the electrodes for it are present.

A map serves exactly the channel set it was baked for. The mapping matrix is a pseudo-inverse over the whole set, so columns cannot be dropped to serve a subset — a montage missing one baked channel falls back to a smaller map, or to the 2D topogram alone.

Cost per asset is roughly `nVertices × nChannels × 4` bytes of matrix, base64-encoded into the bundle: about 230 KiB for 19 channels and 280 KiB for 25. A full 10-10 array of ~73 channels would be near 700 KiB, which is why the 2D topogram, which builds its operator at runtime for any montage, is the answer for those rather than a third asset.

Four things silently produce a wrong asset, and the script's docstring says so at more length: the average-reference projector must be on the `Info` before baking, the trim must stay at `z >= -0.06` m to keep the face without the jaw, the emitted sphere origin must also be handed to the 2D `EegTopogram`, and only the EEG pseudo-inverse path is exercised.

## `verify_numerics.py`

Compares both interpolation paths against MNE-Python on identical input, through the same esbuild bundling the application uses to resolve `#config` and inline the assets.

```sh
python verify_numerics.py
```

Expected: the electrode table within the rounding it is stored at, the 2D topogram at ~1.2e-7 relative and the 3D field map at ~7.0e-8. Both figures are float32 storage of an operator rather than an approximation of the method, so anything above 1e-5 is a real regression. Run this after touching either interpolation path and after regenerating either asset; the vitest suites are faster but only detect drift from their own fixtures.

Re-baking changes the vertex count, so a `nVertices` mismatch reported by `verify_numerics.py` means the asset and the comparison disagree about `--trim-z`, not that the interpolation is wrong.
