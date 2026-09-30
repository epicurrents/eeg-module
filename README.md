# @epicurrents/eeg-module

EEG support for Epicurrents, and the reference implementation of the study-module pattern every other `*-module` package in the family follows. A module owns a modality: it turns a loaded study into a resource the application can display, decides what setups and montages that resource offers, and registers the runtime hooks through which the application mutates it.

It carries no file-format code. A reader package decodes the bytes; this package is what the decoded signal becomes.

## Public surface

| Export | Role |
|---|---|
| `EegStudyLoader` | Claims a loaded study for the EEG modality and builds an `EegRecording` from it, refusing one that cannot fit the configured memory budget. |
| `EegRecording` | The resource: channels, setups, montages, annotations and trends, plus the activation lifecycle that allocates and fills the signal cache. |
| `EegService` | Commissions the reader worker and relays its messages. |
| `EegSetup` | An electrode setup — which raw signals are which electrodes. |
| `EegMontage`, `EegCascadeMontage` | Derived channel layouts over a setup, pinned to the `eeg-montage` worker slot. |
| `EegMontageChannel`, `EegSourceChannel` | Channels of a montage and of the raw recording; the source channel derives its laterality from its name. |
| `EegEvent`, `EegLabel` | Annotations, carrying the EEG coded-event vocabulary stacked on core's shared acquisition set. |
| `EegAmplitudeIntegratedTrend`, `EegSpectrogramTrend`, `EegFrequencyRatioTrend`, `EegPdBsiTrend` | The four trend types, each fixing its own epoch length and math parameters. |
| `EegTopogram`, `EegSurfaceFieldMap` | Scalp field displays: a 2D spherical-spline topogram and a 3D surface field map from a baked asset. |
| `resolveAeegDerivation`, `resolveMontageElectrodes`, `getElectrodePosition`, the colour-ramp helpers | The resolvers and display helpers those two need, exported because a consumer drawing its own view needs the same answers. |
| `runtime` | The resource-module registration: the property mutations the application routes through this modality. |
| `settings` | The module's default settings, which land on `RUNTIME.SETTINGS.modules.eeg`. |
| `EegVideo` | A time-synced video attachment. Nothing constructs one yet — what is missing is a reader that reports a study's video files; see [ROADMAP.md](ROADMAP.md). |

## Recording lifecycle

A recording is built by the loader, then `prepare()`d, then activated — and the three steps are not interchangeable.

`prepare()` commissions the reader worker, learns the recording's true length from it, and attaches the default setups. The setups have to be attached here rather than at activation, because the memory budget counts the derivation slots they declare and the buffer is sized before anything can be cached into it. Only then does the state become `ready`, so that a `ready` recording is one whose setups are really in place.

Activation runs `_completeSetup`: it computes the budget, allocates the shared buffer or the heap cache, starts the trend service, builds the montages and fills the cache. It is idempotent — a ready service means the work is done — which is what lets `preload()` reach the same work on a recording the user has not opened yet.

**The budget is computed in three places and all three have to agree.** The loader decides whether the recording is openable at all, `_completeSetup` asks the memory manager for a float count, and the reader worker's own `_buildDataBlocks` lays the cache out inside what it was given. The block duration is derived the same way in each: three blocks of it must fit inside 95 % of `maxLoadCacheSize`, clamped to a 60-second floor and the `dataBlockDuration` cap. A layout computed against a different block size does not fit the buffer that was allocated, and the result is corrupt signal rather than an error.

## Setups, montages and channels

A setup names which raw signal is which electrode. A montage derives display channels from a setup — as recorded, average reference, longitudinal bipolar, transverse. A cascade montage slices one source channel across several rows instead.

Two ordering rules on `EegRecording` are load-bearing. A montage's worker-side cache is commissioned **before** the montage is published on the `montages` property, because that property change dispatches synchronously and a listener may request signals from inside it; a montage published ahead of its commission answers such a request with no cache and fails. And `isActive` flips synchronously before the teardown it starts, so no observer can see a deactivating recording as active — a resource lookup landing in that window binds to a recording whose buffer is about to go away.

A montage added before the buffer exists is published unwired, and the activation path commissions it once there is something to commission it against.

## Annotations

`EegEvent.CODED_EVENTS` is core's shared acquisition vocabulary followed by this module's own categories, loaded from [src/components/vocabulary/eeg-events.json](src/components/vocabulary/eeg-events.json). The ACTIVATION category is the acquisition half — activation procedures and sensory stimuli — and is what a consuming platform registers as the `epicurrents.eeg` vocabulary; the finding categories stay viewer-side.

The `events` setter applies the deployment's `ignorePatterns` and `convertPatterns` before storing anything, so a site's own annotation labels can be suppressed or rewritten without touching a decoder. Ignoring is checked first, and an ignored event is never converted.

`fromTemplate` on both annotation classes copies template fields with `??` rather than `||`, deliberately: the annotation constructors read an absent option as a request for the default, so a template that marks an annotation hidden or fully transparent has to survive the copy as itself.

## Trends

Four types share one pipeline. Each is constructed with an empty derivation, resolves its electrodes against the recording's setup, and registers with the trend service only once that succeeds — a trend registered before resolution would have the worker compute over channel indices that name nothing.

Resolution tries three strategies in order: the named channel alone, a single channel named like the bipolar pair, then the two electrodes individually. The order matters — with a bipolar channel present, subtracting the two individual electrodes computes a derivation the recording already carries, at a different amplitude.

Nothing computes until a type is requested through `ensureTrendSetup`, with one exception: the aEEG trend auto-computes when `aeeg.autoCompute` is set. The trend compute shares the montage worker with the initial signal requests, so an unrequested trend must not start on its own. Once requested, a type builds from whatever signal is already cached and extends as caching advances, on its own epoch grid.

## Scalp topography

`EegTopogram` is the spherical spline of Perrin et al. (1989), the same interpolation MNE performs for `plot_topomap`, with grid points projected by the azimuthal-equidistant projection MNE uses for topomap layouts. Building the operator depends only on geometry, so `forPositions` caches it; applying it to a frame costs about a millisecond.

`EegSurfaceFieldMap` is the runtime half of `mne.make_field_map`. The expensive part is baked offline by [tools/topography/bake_fieldmap.py](tools/topography) into a mapping matrix, so a frame is one matrix-vector product. Neither class needs Pyodide, numpy or MNE.

Both take the same sphere origin and produce contours from the same levels, so a 2D topogram and a 3D field map drawn from one frame show the same isopotentials.

## Building

```bash
npm run build       # vite + epicurrents-build-types → dist/
npm run lint        # eslint src
npm test            # test:types then test:unit
npm run test:types  # tsc --noEmit -p tsconfig.test.json
npm run test:unit   # vitest run --coverage
```

The module has no worker of its own — the montage work runs in the `eeg-montage` slot of core's montage worker — so there is a single build output.

`test:types` checks the suite against the real `@epicurrents/core` types rather than against the test mocks, which is what stops a test from asserting on a property only a mock has.
