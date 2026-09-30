# @epicurrents/eeg-module — architecture notes for AI coding assistants

This file is the entry point for AI coding assistants working in the `@epicurrents/eeg-module` package: EEG modality support for the Epicurrents viewer. It is also the **reference implementation of the study-module pattern** — every `*-module` package (`emg-module`, `ncs-module`, `acc-module`, `doc-module`, `tab-module`, …) follows the same source layout and the same resource / setup / montage / service decomposition described below, so the layout section is a convention other modules copy rather than an EEG-specific accident. It is tool-agnostic: the conventions apply to any assistant.

## Toolchain compliance — HIGH PRIORITY

This package depends on `@epicurrents/core` and shares a single toolchain with it. **Never pin package-specific versions that diverge from the canonical set** — a divergent TypeScript produces structurally incompatible `.d.ts` files that type-check locally but corrupt data at runtime, because worker-side and main-thread code can then disagree on data layouts or API shapes while everything still compiles.

| Tool | Version |
|---|---|
| TypeScript | `^5.7.0` |
| Vite | `^7.3.1` |
| ESLint | `^9.19.0`, flat config in [eslint.config.mjs](eslint.config.mjs) |
| typescript-eslint | `^8.21.0` |
| tsconfig base | extends `@epicurrents/core/tsconfig.base.json` |

Do not override the options in core's [tsconfig.base.json](../core/tsconfig.base.json) per-package without a comment explaining why. `npm run build` produces one artifact, the ESM `dist/`: [vite.config.mjs](vite.config.mjs) emits the JavaScript, and `epicurrents-build-types` from core emits the declarations and rewrites their `#` aliases into paths a consumer can resolve. The module has no worker of its own, so it needs no standalone bundle.

`npm test` runs two steps: `test:types` type-checks the suite with [tsconfig.test.json](tsconfig.test.json), then `test:unit` runs vitest. **The type check deliberately resolves `@epicurrents/core` to the real package, not to the test mocks** — the runtime substitution happens in [vitest.config.ts](vitest.config.ts) alone. Point the types at the mocks too and a test can assert on a property only a mock has, which verifies nothing about the class the package ships; that is how several assertions in this suite came to read an `options` bag the real annotation classes do not expose. `tests/mocks` is excluded from the check for the same reason: the stubs stand in for core at runtime and are not expected to satisfy its types.

`eslint src` is clean, errors and warnings both. Two rules are off with their reasons in the config: `one-var-declaration-per-line`, because the topography math declares a vector's three components on one line deliberately, and `max-len`'s `@param` exemption, which is the family's documented overrun stated where the rule can see it. The stale nested `eslint@8` tree under `node_modules` shadows the workspace's ESLint 9 and has to be removed rather than worked around — the symptom is a `TypeError` while loading a rule, not a version message.

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
    vocabulary/
      eeg-events.json     # coded event vocabulary: the activation set and the findings
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
4. Checks the recording against the memory budget and sets the state accordingly: `loaded` when it fits whole or through the rolling cache, `error` with a reason when even the floor-sized rolling cache does not
5. Clears `_study`, so a second call builds nothing rather than a duplicate resource

**Every exit from that check must set a state.** A recording handed back in its constructed state (`added`) is opened as though it had passed the budget check, including when the application runtime is absent and the check could not run at all.

The three loading entry points — `loadFromFile`, `loadFromUrl`, `loadFromDirectory` — each claim the loaded study for the modality through `_claimAsEeg`, which restamps **every** file marked `signal` as `eeg`, not just the first. The importers are modality-agnostic, so without the claim a service looking its data file up by modality finds nothing; claiming only the first presents a directory-spanning study to the service as whichever member sorted first.

### EegRecording activation lifecycle

`prepare()` is called externally (by `Epicurrents.loadStudy`) after `getResource`. It commissions `EegService.setupWorker(header, study, options, formatHeader)` → sends `setup-worker` to the format worker → the worker sets up the study from the parsed header and URL. The worker returns the recording length → `prepare()` sets `totalDuration`, applies the default setups through `_applyDefaultSetups`, and only then sets `state = 'ready'`.

**That order is the contract, in both directions.** The setups have to be attached during `prepare()` because the activation-time budget walks `_setup.derivations` to size their cache slots into the buffer, and a derivation declared after the buffer is locked gets no slot. And `state` has to flip after them, so that `ready` — which is what makes the resource `isReady` — truthfully implies the setups are in `_setups`; otherwise `_applyDefaultMontages` finds no setup to key on and silently adds zero montages.

`prepare()` also re-dispatches ACTIVATE when it finds the recording already active but its service not ready. The loader starts `prepare()` without awaiting it and `setActiveResource` does not check `isReady`, so a recording can be activated before it is prepared; the activation handler's own `state === 'ready'` guard is false at that point and nothing else would retrigger it, leaving the recording open with no montages, no channel offsets and no data until it is reopened.

Activation and `preload()` both run `_completeSetup`, which:
1. Computes the memory budget and requests it (`requestMemory(totalMem)`), or sets up the JS-heap `BiosignalCache` when there is no memory manager
2. Starts the trend service against the reader's buffer
3. Applies the default montages (`_applyDefaultMontages` — the bundled 10-20 setups' avg / lon / rec / trv, plus the extra CZ-ref and Laplacian montages), then wires any montage that was added before the buffer existed
4. Installs the `signalCacheStatus` and `SIGNAL_CACHING_COMPLETE` listeners that drive progressive trend computation
5. Starts `cacheSignals()`

It is idempotent — a ready service means the work is done, and a recording that has not finished `prepare()` is not set up to receive it. `preload()` exists to move that cost to a moment where the user is looking at something else, and reads the resulting state back off the resource rather than returning its own guard's narrowing, which would report success for a failed allocation.

A failure at step 1 sets the error state and deactivates the recording **only when it was actually active**: a failed preload is already inactive, and assigning `false` again dispatches DEACTIVATE and begins unloading a resource that was never up.

### The memory budget is computed in three places

`_completeSetup` asks the memory manager for a float count; `EegStudyLoader.getResource` decides whether the recording is openable at all; the reader worker's `_buildDataBlocks` lays the cache out inside what it was given. **All three derive the block duration the same way** — three blocks of it must fit inside 95 % of `maxLoadCacheSize`, clamped to a 60-second floor and the `dataBlockDuration` cap — and a layout computed against a different block size does not fit the buffer that was allocated. The failure is corrupt signal, not an error.

The count is `6` (a lock cell plus five mutex meta fields, which must track the set in `BiosignalMutex`) plus, per source channel *and per derivation cache slot*, its sample allocation plus `BiosignalMutex.SIGNAL_DATA_POS` header floats. Allocation is the channel's full sample count when the whole recording fits the budget, and `min(sampleCount, ceil(3 × blockDuration × samplingRate))` when it does not. Leaving the derivation slots out allocates a buffer the worker then overruns.

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

`EegService` is mostly a pass-through to `GenericBiosignalService`. Its only real addition is `setupWorker(header, study, options, formatHeader)`, which commissions `'setup-worker'` carrying:
- The serializable header, and the URL of the study's EEG data file — `study.files` filtered by `modality === 'eeg'` **and** `role === 'data'`, never simply the first file.
- The `File` itself where the study carries one. The URL beside it is a `blob:` reference to the same bytes, so reading part ranges back through the fetch stack would copy every one of them for nothing.
- Every data file, not just the first. A recording whose signal spans a directory has no single member that is the recording; a single-file reader ignores the list.
- The optional authorization header, or null.
- **A snapshot of the main thread's app cache settings** (`dataBlockDuration`, `dataChunkSize`, `logThreshold`, `maxDirectLoadSize`, `maxLoadCacheSize`, `signalLoadingYieldMs`, `useMemoryManager`). The worker's `_buildDataBlocks` decides its rolling-cache layout from these; left to the bundled defaults it computes a layout that does not fit the buffer the main thread allocated. Sending `null` when there is no runtime is deliberate — a partial snapshot would be worse than none.

The handler is async while the worker's message slot is not, so the constructor's listener catches the rejection itself. A `void` there reports a malformed worker message nowhere at all.

All other commission handling (`cacheSignals`, `getSignals`, `setupMutex`, `setupCache`) is inherited from `GenericBiosignalService`.

### Event pattern filtering

The `EegRecording.events` setter applies `ignorePatterns` (regex) and `convertPatterns` (regex → property map) from EEG module settings before calling the base class setter. This lets deployment-specific annotation labels be suppressed or re-mapped without touching the decoder.

Three things about it are easy to break. The ignore loop splices the array it is iterating and steps the index back, so removing that step-back skips whatever moved into the removed slot and leaves consecutive matches in. Ignoring is checked before converting and continues the outer loop, so the two rules never both act on one event. And every matching convert pattern is applied rather than the first, so a second pattern sees the result of the first — a label can describe more than one thing a deployment wants rewritten.

With no settings the setter assigns nothing at all. The patterns are the deployment's, so storing the events unfiltered would publish labels it has said it does not want shown.

`fromTemplate` on `EegEvent` and `EegLabel` copies template fields with `??`, not `||`. The annotation constructors read an absent option as a request for the default — `visible` resolves to `true` and `opacity` is assigned unguarded — so `||` turns a hidden annotation visible and a fully transparent one into whatever the renderer defaults to. The same defect is live in emg-module and ncs-module.

### Coded events — [src/components/vocabulary/eeg-events.json](src/components/vocabulary/eeg-events.json)

`EegEvent.CODED_EVENTS` is the shared set of core's `GenericBiosignalEvent` (TECHNICAL, INTERVENTION, OBSERVATION, ENVIRONMENT) followed by this module's own categories, loaded from the vocabulary file and stacked with `mergeCodedEvents`. ACTIVATION is the acquisition half of the EEG set — eyes closed and open, hyperventilation with its start and end, photic stimulation per frequency, the sensory stimuli (auditory and verbal kept apart, tactile, noxious with the method in `meta`, non-photic visual) and passive eye opening — and is what a consuming platform registers as the `epicurrents.eeg` vocabulary; the finding categories are scoped `finding` and stay viewer-side. The lookup and extension statics are inherited from core and read `this.CODED_EVENTS`, so `EegEvent.getEventForCode` finds a shared term and `EegEvent.extendEvents('OTHER', …)` writes into this module's table while `EegEvent.extendEvents('OBSERVATION', …)` writes into core's. The file's `version` moves whenever a term is added, deprecated or its crosswalk changes; a code never changes once shipped. The crosswalk columns were checked against DICOM CID 3035, whose own table repeats the nystagmoid identifier for slow eye movements and has one code for swallowing and chewing; those are not errors here. Design and term tables: the consuming platform repository's `docs/engineering-notes/annotation-event-vocabulary.md`.

The test mock of core under [tests/mocks/epicurrents-core/](tests/mocks/epicurrents-core/) loads core's vocabulary file and its loaders from the core checkout beside this package, so an `EegEvent` test sees the real merged view without building core.

### EegMontage

Thin subclass of `GenericBiosignalMontage`. Key difference: the constructor forces `overrideWorker: 'eeg-montage'` so the EEG montage uses its own named worker slot (different from the generic `'montage'` slot). `mapChannels()` reads EEG settings from the global runtime to build `ConfigMapChannels`.

### `unloadOnClose` setting

The `EegRecording.isActive` setter checks `_SETTINGS.unloadOnClose`. If true, deactivating a resource calls `this.unload()` so memory is freed when the recording is closed in the UI.

`releaseBuffers` empties the events, labels, interruptions and videos by mutating them directly, so no property change is dispatched for any of them — a listener bound to `events` still believes it holds them, and anything a user added in the session is gone. Reopening re-reads the file's own annotations. See [ROADMAP.md](ROADMAP.md).

---

## SAB cache lifecycle — EegRecording-specific fixes

The general **three-level cache lifecycle** (Level 1 `releaseSignalArrays` soft release, Level 2 `releaseCache` / `releaseBuffers` full teardown, Level 3 `destroy`) and its in-flight-read drain are documented in `@epicurrents/core`; the notes below cover only what `EegRecording` itself owns.

### ACTIVATE phase guard

See "EegRecording activation lifecycle" above. The `if (!this._isActive) return` guard stays regardless of cache-lifecycle changes — it is about `GenericAsset.isActive` dispatching both `'before'` and `'after'`, not about the cache.

### Synchronous `_isActive` flip

**`_isActive` flips synchronously, before the teardown it starts.** The guarantee the setter makes is that no observer can see a deactivating recording as active, not even for one microtask. `getActiveResource()` iterates the resources and returns the first active one, so a lookup landing inside such a window — a resource switch is exactly when one does — binds the newly mounted viewer to the recording that is about to release its buffer; every signal request against it then fails once the release nulls the worker-side cache.

The release itself is asynchronous and runs in the background with its draining and commission round-trip intact. The setter holds the pending promise so `awaitDeactivation` can block a following allocation until the shared buffer has finished being released and rearranged — otherwise the next recording's caching races the rearrange and reads a moved region. A listener that needs to know when the teardown has completed subscribes to the service's `isReady` property change rather than the resource's DEACTIVATE event, which fires at the start of it.

### `addMontage` — cache setup before the `'montages'` dispatch

**A montage's worker-side cache is commissioned before the montage is published on the `montages` property.** The property-change dispatch is synchronous and a listener may request signals from inside it; a montage published ahead of its commission answers such a request while the worker-side processor still holds no cache, which fails rather than waiting. Awaiting the commission — on both the mutex and the JS-heap branch — means every listener sees a montage that can serve signals. Interruptions are applied before the dispatch for the same reason.

Where neither a mutex nor a cache exists yet, there is nothing to commission against and the montage is published unwired; `_wireMontageDataSources` commissions it from `_completeSetup` once the buffer is in place. A consumer is free to add a montage as soon as the resource is constructed, so this is an ordinary path rather than an edge case.

---

## Biosignal trends — the EEG-owned parts

A **trend** is a derived per-epoch signal computed from one or more montage channels. The generic architecture — the `BiosignalTrendType` union, `GenericBiosignalTrend`, the math functions in core's `util/signal.ts`, `MontageProcessor.computeTrendEpoch` / `computeTrend`, the `setup-trend` / `compute-trend` / `cancel-trend-computation` worker commissions, and the montage-level trend registry — lives in `@epicurrents/core` and is documented there. This package supplies the EEG-specific wrapper, derivation resolution, lifecycle, and defaults.

| Piece | Location | Role |
|---|---|---|
| Concrete trend | `EegAmplitudeIntegratedTrend` in `src/components/` | Fixes `type: 'amplitude'` and the NICU-standard 2 / 15 Hz band-pass; `samplingRate` is `1 / epochLength`. Epoch length is not fixed here — see below |
| Resolver | `resolveAeegDerivation(setup, source, reference)` in `src/util/derivation.ts` | Maps a derivation's source/reference electrode names onto setup channel indices, returning `{ sourceChannels, referenceChannels }` or `null`. Three strategies **in this order**: the named channel alone (reference-less, the channel already carries the derivation), a single channel named like the bipolar pair, then the two electrodes individually. The order is load-bearing — with a bipolar channel present, subtracting the two individual electrodes computes a derivation the recording already carries, at a different amplitude. Matching is exact after case-folding and trimming, so `C3` is never served by `C3A2` |
| Lifecycle | `EegRecording.ensureTrendSetup(type)` + `_setupTrend(trend, initialCachedEnd)` | Setup is triggered on montage change and as signal caching progresses. Compute is gated on `settings.aeeg.autoCompute` (default `false`) **or** an explicit request registered through `ensureTrendSetup`, which the UI calls when the trend strip is first made visible |
| Settings | `CommonBiosignalSettings.trends.amplitude` (math, in core) + `EegModuleSettings.aeeg` (derivations, display) | EEG defaults set in `src/config/index.ts` |

### Registration happens after resolution, never at construction

`GenericBiosignalTrend`'s constructor registers with the trend service only when its derivation already names source channels. Every EEG trend is constructed with an empty derivation and resolved afterwards, so **the constructor never registers one** and `tryResolveDerivation` / `tryResolvePairs` must call `_registerWithService()` themselves once resolution succeeds. A trend registered before resolution has the worker compute over channel indices that name nothing; one that resolves and forgets to register never computes at all, and neither says anything.

`resolvePdbsiPairs` returns `null` rather than an empty array when no pair resolves, for the same reason: `tryResolvePairs` reads the null as "discard this trend", and an empty array is truthy and would register a trend with no inputs.

### The build gates, and which of them are silent

Each `_build*Trends` method returns early on a list of conditions, every one of which fails by leaving the trend strip empty rather than by erroring. In the order they are checked: no derivations configured, no setup attached, the type not requested (and, for amplitude only, `aeeg.autoCompute` off), a trend of that type already registered, no epoch length derivable, no trend service yet, and less than one epoch cached. The spectrogram adds one of its own — the recording's `samplingRate` must be known, because its bin layout is computed against the input rate.

The type check is per type, not "any trend": the amplitude and spectrogram trends coexist briefly while the user switches between them, and a guard that looked for any registered trend would leave the second type unbuilt.

`_scheduleTrendSetup` returns without scheduling when no type is requested and none auto-computes. Signal-cache progress calls it on every update, so that guard is what keeps a closed trend strip from queueing a microtask per update for the whole load.

### Lifecycle and compute gating

`ensureTrendSetup(type = 'amplitude')` adds the type to `_trendsEnabled` and schedules a setup. Once a type is in that set, every subsequent `_setupTrend` invocation proceeds regardless of `autoCompute` — so montage changes and recompute requests always rebuild trends for types the user has already opened, while the on-demand semantics still hold (nothing happens until the UI first requests setup for a given type). `_trendSetupScheduled` collapses a `SIGNAL_CACHING_COMPLETE` and an `activeMontage` property change that land in the same synchronous turn into one setup. `clearTrendTypes()` empties the set — call it before `ensureTrendSetup` when switching trend types so stale types don't cause unintended builds.

`autoCompute` is off by default because trend compute runs in the same montage worker as the initial signal requests, and the per-epoch CPU work would otherwise delay the first page render until caching is well underway. Set it to `true` for kiosk/dashboard deployments where the trend is the primary display.

### Epoch length

All four trend types ship `trends.<type>.epochLength: 0`, which is the request to derive a length from the recording rather than a missing setting. The four `_build*Trends` methods resolve it through core's `resolveTrendEpochLength(this.totalDuration, settings.trends?.<type>)` and skip the build if that comes back 0, so nothing ever divides by a zero-length epoch.

The ladder is `TREND_EPOCH_SCALING` in [src/config/index.ts](src/config/index.ts), shared by every type and copied per type so configuring one leaves the others alone: 2 s up to 45 minutes, 5 s to an hour and a half, 10 s beyond that, and past roughly five and a half hours a target of 2000 epochs at ten-second granularity takes over — the larger of the step and the target wins, so the handover needs no threshold of its own.

Two seconds is the floor and no step goes below it. It is a floor on what an epoch can *mean*: EEG activity worth seeing on a trend routinely runs longer than a second, and a one-second epoch splits such an event in half and classifies each half on its own. The band trends want the same floor for their own reason, since a one-second epoch resolves the FFT only to 1 Hz while delta (1–4 Hz) and theta (4–8 Hz) are a few Hz wide.

A deployment or a user that writes a non-zero `epochLength` pins it, and the derivation never overrides it. That is why zero rather than an absent key is the sentinel — settings arrive merged, so an absent key and a deliberate default cannot be told apart, and a derivation keyed on absence would silently beat a deployment's explicit choice.

### Signal layout and new types

The amplitude trend's signal layout is implicit and interleaved — `[min0, max0, min1, max1, …]` per epoch, so a renderer reads `signal.length / 2` epochs. A new per-modality trend wrapper should document its own layout in the wrapper class.

To add a **new trend type**: extend the `BiosignalTrendType` union and add the math function and processor dispatch in `@epicurrents/core`, then (optionally) add a per-modality wrapper class here that fixes the type and supplies EEG defaults, extend `EegModuleSettings` in [src/types/config.ts](src/types/config.ts) and its defaults in [src/config/index.ts](src/config/index.ts) if it needs EEG-specific knobs, and mirror the `ensureTrendSetup` lifecycle in `EegRecording` if it should auto-instantiate.

---

## Scalp topography

[src/topography/](src/topography/) computes scalp voltage fields from a frame of channel values. Nothing in it needs Pyodide, numpy or MNE at runtime, and nothing in it touches the DOM or WebGL — it produces pixel buffers, per-vertex scalars and contour segments as plain typed arrays, and the consumer draws them.

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

The JSON under [src/config/](src/config/) is imported by the sources that need it, so the build carries its contents in `dist/` rather than copying the files. A file nothing imports is therefore not part of the published package: [defaults.json](src/config/defaults.json) is such a catalogue, and a stale one — it names a `lpl` montage path that does not exist and calls the longitudinal montage `dbn`. Wire a file into a source import to ship it.

**A bundled setup is registered under its map key in `EegRecording.DEFAULT_MONTAGES`, and its own `name` field has to match.** The key is what `defaultSetups`, `defaultMontages` and every montage identifier are matched against, while `addSetup` answers a name collision by returning the setup already registered — so two bundled setups declaring one name means the second is discarded with nothing logged above debug level. The 10-10 setup shipped that way, declaring the 10-20 name it was copied from. [tests/defaultSetups.test.ts](tests/defaultSetups.test.ts) pins the key, the name, the label and each montage name for every bundled setup, and checks that every name the settings reference resolves.

[src/config/topography/](src/config/topography/) holds generated JSON — an electrode position table and one baked field map per channel set. **Generated, not hand-edited**: [tools/topography/](tools/topography/) regenerates and verifies them, and its README covers baking a map for a new channel set. Numeric arrays are base64 of packed binary in a fixed layout that the writer and the reader hold independently, versioned so the two cannot silently drift.

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
