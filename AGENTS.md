# @epicurrents/eeg-module — architecture notes for AI coding assistants

This file is the entry point for AI coding assistants working in the `@epicurrents/eeg-module` package: EEG modality support for the Epicurrents viewer. It is also the **reference implementation of the study-module pattern** — every `*-module` package (`emg-module`, `ncs-module`, `acc-module`, `doc-module`, `tab-module`, …) follows the same source layout and the same resource / setup / montage / service decomposition described below, so the layout section is a convention other modules copy rather than an EEG-specific accident. It is tool-agnostic: the conventions apply to any assistant.

## Toolchain compliance — HIGH PRIORITY

This package depends on `@epicurrents/core` and shares a single toolchain with it. **Never pin package-specific versions that diverge from the canonical set** — a divergent TypeScript produces structurally incompatible `.d.ts` files that type-check locally but corrupt data at runtime, because worker-side and main-thread code can then disagree on data layouts or API shapes while everything still compiles.

| Tool | Version |
|---|---|
| TypeScript | `^5.7.0` |
| ts-loader | `^9.5.1` |
| webpack | `^5.73.0` |
| tsconfig base | extends `@epicurrents/core/tsconfig.base.json` |

Do not override `tsconfig.base.json` options per-package without a comment explaining why. Both build outputs must be regenerated together after any shared-code change: the UMD bundle (`umd/`) and the TSC `dist/` output are separate artifacts, and rebuilding only one leaves a stale mismatch.

---

## Study module concept

**Pattern shared by all `*-module` packages.**

```
src/
  EegRecording.ts         # extends GenericBiosignalResource — the top-level resource
  components/
    EegMontage.ts         # extends GenericBiosignalMontage
    EegSetup.ts           # extends GenericBiosignalSetup (channel definitions)
    EegSourceChannel.ts   # physical electrode channel
    EegMontageChannel.ts  # derived (montage) channel
    EegEvent.ts           # timed event annotation
    EegLabel.ts           # label annotation
    EegVideo.ts           # associated video resource
    EegAmplitudeIntegratedTrend.ts  # aEEG trend wrapper (see Trends below)
  service/
    EegService.ts         # extends GenericBiosignalService — commissions the worker
  loader/
    EegStudyLoader.ts     # extends BiosignalStudyLoader — creates EegRecording
  config/
    defaults/             # bundled 10-20 and 10-10 setups + standard montages (JSON)
    extra/                # additional montage definitions
    topography/           # generated electrode positions + baked field maps (JSON)
  pyodide/
    scripts/              # Python scripts run via PyodideService for signal filtering
  runtime/                # module registration export (consumed by the interface)
  topography/             # scalp field interpolation (see Scalp topography below)
  types/                  # EEG-specific TypeScript types
  util/                   # module-local helpers (derivation resolution, …)
```

`EegRecording` is what gets added to a `Dataset`. It holds `EegSetup` (electrode positions + source channels) and a list of `EegMontage` objects. `EegService` owns the web worker that reads signal data on demand.

A new modality module mirrors this shape: a `<Modality>Recording` extending `GenericBiosignalResource`, per-modality `components/` (montage, setup, channels, annotations), a `service/<Modality>Service.ts` extending `GenericBiosignalService`, a `loader/<Modality>StudyLoader.ts`, bundled `config/` defaults, and a `runtime/` export that registers the module with the application.

---

## EEG module internals

### EegStudyLoader → EegRecording creation

`EegStudyLoader.getResource(idx)` is called by `Epicurrents.loadStudy()`. It:
1. Extracts `channels`, `header` (already parsed by the importer, e.g. `EdfImporter` from `@epicurrents/edf-reader`), and `formatHeader` from `study.meta`
2. Gets the format worker (`_studyImporter.getFileTypeWorker('eeg')`)
3. Constructs `new EegRecording(name, channels, header, worker, memoryManager, config)` — the recording owns the worker from this point

### EegRecording activation lifecycle

`prepare()` is called externally (by `Epicurrents.loadStudy`) after `getResource`. It commissions `EegService.setupWorker(header, study, options, formatHeader)` → sends `setup-worker` to the format worker → the worker sets up the study from the parsed header and URL. The worker returns `{ dataLength, recordingLength }` → `prepare()` sets `totalDuration` and `state = 'ready'`.

When `isActive` is set to `true` (user opens the recording), the `ACTIVATE` event handler runs:
1. Requests SAB memory (`requestMemory(totalMem)`) or sets up `BiosignalCache`
2. Calls `addDefaultSetupsAndMontages()` — loads bundled 10-20 JSON setups + standard montages (avg, lon, rec, trv), optionally extra montages (CZ-ref, Laplacian)
3. Starts `cacheSignals()` — progressive background loading

**The ACTIVATE listener must guard `if (!this._isActive) return` at the top.** `GenericAsset.isActive` dispatches ACTIVATE for both `'before'` (while `_isActive` is still `false`) and `'after'` phases. Without the guard the full setup body — `requestMemory`, `setupMutex` — runs in `'before'`, leaving `isReady = true`; the `'after'` handler then sees `isReady = true` and skips everything, including `cacheSignals()`, and signals stay permanently empty. This applies to **any** ACTIVATE listener in a resource subclass.

### Recording → Setup → Montage → Channel hierarchy

```
EegRecording
  _channels: EegSourceChannel[]   (one per raw signal in the file)
  _setups: EegSetup[]             (electrode position + channel matching)
    .channels: SetupChannel[]     (mapped: raw index → setup channel)
  _montages: EegMontage[]         (display derivations)
    .channels: EegMontageChannel[] (active - reference arithmetic)
```

`addSetup(config, channels)` → `new EegSetup(channels, config)` — matches source signal labels to setup channel names/patterns. The first setup is stored as `this.setup` (the canonical one).

`addMontage(name, label, setup, template)` → `new EegMontage(name, recording, setup, template, manager)` → `montage.mapChannels()` → `mapMontageChannels(setup, config)` (core utility) → populates `EegMontageChannel[]` with `active`/`reference` indices. Then `montage.setupServiceWithInputMutex(mutexProps)` or `setupServiceWithCache(cache)` wires the montage's `MontageService` to the raw signal source.

### EegService (thin wrapper)

`EegService` is mostly a pass-through to `GenericBiosignalService`. Its only real addition is `setupWorker(header, study, options, formatHeader)` which:
- Extracts the data file URL from `study.files` (filtered by `modality === 'eeg'` and `role === 'data'`)
- Commissions `'setup-worker'` to the format worker with the serializable header, URL, and optional auth header

All other commission handling (`cacheSignals`, `getSignals`, `setupMutex`, `setupCache`) is inherited from `GenericBiosignalService`.

### Event pattern filtering

The `EegRecording.events` setter applies `ignorePatterns` (regex) and `convertPatterns` (regex → property map) from EEG module settings before calling the base class setter. This lets deployment-specific annotation labels be suppressed or re-mapped without touching the decoder.

### EegMontage

Thin subclass of `GenericBiosignalMontage`. Key difference: the constructor forces `overrideWorker: 'eeg-montage'` so the EEG montage uses its own named worker slot (different from the generic `'montage'` slot). `mapChannels()` reads EEG settings from the global runtime to build `ConfigMapChannels`.

### `unloadOnClose` setting

The `EegRecording.isActive` setter checks `_SETTINGS.unloadOnClose`. If true, deactivating a resource calls `this.unload()` (releases SAB buffers, clears events/interruptions) so memory is freed when the recording is closed in the UI.

---

## SAB cache lifecycle — EegRecording-specific fixes

The general **three-level cache lifecycle** (Level 1 `releaseSignalArrays` soft release, Level 2 `releaseCache` / `releaseBuffers` full teardown, Level 3 `destroy`) and its in-flight-read drain are documented in `@epicurrents/core`; the notes below cover only what `EegRecording` itself owns.

### ACTIVATE phase guard

See "EegRecording activation lifecycle" above. The `if (!this._isActive) return` guard stays regardless of cache-lifecycle changes — it is about `GenericAsset.isActive` dispatching both `'before'` and `'after'`, not about the cache.

### Synchronous `_isActive` flip

The core's release drain made the **resource-switch** workflow (`setActiveResource(newResource, true)` with `unloadOnClose=true`) reliably error out with "signal cache has not been set up yet" cascades. Diagnosis: the `EegRecording.isActive` setter was deferring the `_isActive = false` assignment into `unload().then(...)`. The drain widened that `.then` enough that, by the time the runtime fired `'set-active-resource'` and the UI re-rendered, `getActiveResource()` iteration still saw the **old** recording as active (its `_isActive` hadn't flipped yet) and returned it — the newly-mounted viewer then captured the **wrong** resource. Once the old recording's release completed and nulled its `MontageProcessor._cache`, every `getAllSignals` from the plot bound to the old resource errored.

**Fix:** flip `_isActive` synchronously **before** kicking off `unload()`; `unload()` runs in the background (with all its draining + commission round-trip preserved). The runtime iteration now sees the new resource immediately. The setter holds the pending unload promise so `awaitDeactivation` can block a following allocation until the shared buffer has finished being released and rearranged.

An inline comment in the `isActive` setter explains the ordering. Any listener that needs to know when the actual teardown completes should subscribe to the service's `isReady` property change, not the resource's `DEACTIVATE` event.

### `addMontage` — cache setup before the `'montages'` dispatch

`EegRecording.addMontage` used to dispatch `_setPropertyValue('montages', [...])` **before** calling `setupServiceWithInputMutex` / `setupServiceWithCache`. The property change is synchronous and fans out to the UI (montage change → channel layout → channel offset change → resource `'channels'` change → plot trace update → `getAllSignals`). Synchronous listeners thus posted `get-signals` to the worker **before** the cache setup commission was even queued; the worker's `MontageProcessor._cache` was still `null` → the same "cache has not been set up yet" error.

**Fix:** in `addMontage`, set up the cache (awaited) and apply interruptions **before** dispatching the `'montages'` property change. The non-SAB branch (`setupServiceWithCache`) is `await`-ed too; previously it was fire-and-forget. Synchronous listeners now see a fully-ready montage.

---

## Biosignal trends — the EEG-owned parts

A **trend** is a derived per-epoch signal computed from one or more montage channels. The generic architecture — the `BiosignalTrendType` union, `GenericBiosignalTrend`, the math functions in core's `util/signal.ts`, `MontageProcessor.computeTrendEpoch` / `computeTrend`, the `setup-trend` / `compute-trend` / `cancel-trend-computation` worker commissions, and the montage-level trend registry — lives in `@epicurrents/core` and is documented there. This package supplies the EEG-specific wrapper, derivation resolution, lifecycle, and defaults.

| Piece | Location | Role |
|---|---|---|
| Concrete trend | `EegAmplitudeIntegratedTrend` in `src/components/` | Fixes `type: 'amplitude'`, NICU-standard defaults (5 s epochs, 2 / 15 Hz band-pass); `samplingRate` is `1 / epochLength` |
| Resolver | `resolveAeegDerivation(setup, source, reference)` in `src/util/derivation.ts` | Maps a derivation's source/reference electrode names onto setup channel indices, returning `{ sourceChannels, referenceChannels }` or `null`. Handles the reference-less case (the source channel already carries the full derivation) as well as explicit source/reference pairs |
| Lifecycle | `EegRecording.ensureTrendSetup(type)` + `_setupTrend(trend, initialCachedEnd)` | Setup is triggered on montage change and as signal caching progresses. Compute is gated on `settings.aeeg.autoCompute` (default `false`) **or** an explicit request registered through `ensureTrendSetup`, which the UI calls when the trend strip is first made visible |
| Settings | `CommonBiosignalSettings.trends.amplitude` (math, in core) + `EegModuleSettings.aeeg` (derivations, display) | EEG defaults set in `src/config/index.ts` |

`ensureTrendSetup(type = 'amplitude')` adds the type to `_trendsEnabled` and schedules a setup. Once a type is in that set, every subsequent `_setupTrend` invocation proceeds regardless of `autoCompute` — so montage changes and recompute requests always rebuild trends for types the user has already opened, while the on-demand semantics still hold (nothing happens until the UI first requests setup for a given type). `_trendSetupScheduled` collapses a `SIGNAL_CACHING_COMPLETE` and an `activeMontage` property change that land in the same synchronous turn into one setup. `clearTrendTypes()` empties the set — call it before `ensureTrendSetup` when switching trend types so stale types don't cause unintended builds.

`autoCompute` is off by default because trend compute runs in the same montage worker as the initial signal requests, and the per-epoch CPU work would otherwise delay the first page render until caching is well underway. Set it to `true` for kiosk/dashboard deployments where the trend is the primary display.

The amplitude trend's signal layout is implicit and interleaved — `[min0, max0, min1, max1, …]` per epoch, so a renderer reads `signal.length / 2` epochs. A new per-modality trend wrapper should document its own layout in the wrapper class.

To add a **new trend type**: extend the `BiosignalTrendType` union and add the math function and processor dispatch in `@epicurrents/core`, then (optionally) add a per-modality wrapper class here that fixes the type and supplies EEG defaults, extend `EegModuleSettings` in `src/config/index.ts` if it needs EEG-specific knobs, and mirror the `ensureTrendSetup` lifecycle in `EegRecording` if it should auto-instantiate.

---

## Scalp topography

`src/topography/` computes scalp voltage fields from a frame of channel values. Nothing in it needs Pyodide, numpy or MNE at runtime, and nothing in it touches the DOM or WebGL — it produces pixel buffers, per-vertex scalars and contour segments as plain typed arrays, and the consumer draws them.

| Piece | Role |
|---|---|
| `EegTopogram` | 2D map. Spherical spline of Perrin et al. (1989), the same method as MNE's `_make_interpolation_matrix`. Handles any montage: the operator is built at runtime from electrode positions |
| `EegSurfaceFieldMap` | 3D map on a scalp mesh. Applies a mapping matrix baked offline, `field = mapping @ data`, so a frame is one matrix-vector product |
| `electrodes.ts` | Label → head-coordinate position, from the bundled `standard_1005` table |
| `colorRamp.ts` | The diverging ramp both views colour through |

Both agree with MNE-Python to ~1e-7 relative on identical input. That is float32 storage of an operator, not an approximation of the method, so a larger error is a real regression — `tools/topography/verify_numerics.py` checks it against MNE itself rather than against a stored fixture, and is the test that matters after touching either interpolation path.

### Geometry contracts

These are shared between the two views and between this package and its consumer. Breaking one produces a plausible-looking picture rather than an error, which is what makes them worth stating.

- **Both views must share a sphere origin.** A baked field map carries the origin it was built around; hand that same origin to the `EegTopogram` for the montage, or the two disagree about where the head is.
- **The 2D projection is azimuthal-equidistant**: the radius *is* the polar angle. An orthographic projection is the obvious alternative and renders nearly flat.
- **Row 0 of the topogram buffer is the top `ImageData` row**, so it maps to +y — a view from above with the nose up. Reversing it flips the map and silently desynchronises it from a 3D view.
- **`project` and `electrodePixels` are not the same thing.** The first is the exact inverse projection, which is what puts a value at a grid point. The second additionally applies MNE's topomap layout scaling, which is where a reader of MNE topomaps expects a marker. Part of the outer ring falls outside the head circle either way, so a consumer must leave margin rather than clip.
- **The origin is fitted only when the montage over-determines it.** Four near-coplanar electrodes determine an exact sphere centred well outside the head, and every electrode then projects to nearly the same polar angle. Below that threshold, or when the fit runs away, a fixed anatomical origin stands in.
- **Electrode positions are not mesh positions.** A montage defines them on an idealised head; the mesh is a real scalp, and the two differ by millimetres. `electrodeAnchors` projects them onto the mesh for drawing, `electrodes` keeps them as the montage defines them.

### Assets

`src/config/topography/` holds generated JSON — an electrode position table and one baked field map per channel set. **Generated, not hand-edited**: `tools/topography/` regenerates and verifies them, and its README covers baking a map for a new channel set. Numeric arrays are base64 of packed binary in a fixed layout that the writer and the reader hold independently, versioned so the two cannot silently drift.

The assets are third-party material, not ours: the mapping matrices come from MNE-Python (BSD-3-Clause) and the mesh derives from the FreeSurfer fsaverage subject, under a licence that is not OSI-approved and that requires its text accompany copies. `NOTICE` and `licenses/` in the package root hold the terms, `package.json#files` ships them, and each generated file repeats its own provenance in an `attribution` field. Anything that redistributes the built output carries the mesh and these conditions with it.

A field map serves exactly the channel set it was baked for — the mapping matrix is a pseudo-inverse over the whole set, so columns cannot be dropped to serve a subset. `EegSurfaceFieldMap.forLabels` picks the map with the most channels a recording can feed, matching by resolved position rather than by name so that alternative nomenclature resolves. Adding a map means baking it and adding it to `BAKED`; the order of that list carries no meaning.

### Consuming this from another package

Consumers import the built `dist/`, so a change here is invisible to them until this package is rebuilt — a symptom that appears in the consumer while the cause sits in an unbuilt source file. Adding a member to the geometry surface is therefore a cross-package change in both directions: a consumer written against the new member has to tolerate its absence, because it can legitimately run against an older build of this package.

---

## Code comment conventions

Comments and docstrings describe the code's **current contract** — what it does and the invariants it upholds, for a reader who has never seen an earlier version.

- **No change history or anecdotes.** Don't narrate what the code used to do, what a change replaced, or why it was added. That belongs in the commit message, where `git blame` surfaces it; in the file it rots as soon as the change lands.
- **Describe the layer's own contract, not its consumers.** A module or worker comment shouldn't name a specific upper-layer UI component — state the invariant the layer guarantees so it holds regardless of who calls it.
- **Keep the `@package` / `@copyright` / `@license` header** on every source file.
- **Wrap TypeScript source at a 120-column soft cap** — code, docstrings, and comments alike. The one exception: `@param` docstrings stay on a single line regardless of length, because wrapping them renders poorly in the VS Code hover. Do not hard-wrap Markdown prose: one line per paragraph, since docs are read as rendered output at varying widths.
