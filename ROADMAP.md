# @epicurrents/eeg-module — roadmap

What the package's own audit left open. The three findings carried in from the sibling audits — the `||` template copy, the pre-flat-config lint toolchain and the stale declared core range — are all closed, as is the 10-10 setup name collision the audit itself found.

## `EegVideo` awaits a reader that reports video files

`EegVideo`, `EegRecording.hasVideo`, the `videos` accessor and `EegStudyProperties.videos` are a complete feature surface that nothing currently constructs — the only code that would have built one was a commented-out block in `prepare()`, removed as dead. The surface stays: the concept is proven in acc-module, and what is missing here is a reader that reports the video files of a study rather than anything in this package.

Wiring it needs the study context to carry them, at which point `prepare()` builds one per entry.

## The 10-10 setup is selectable but not in the shipped defaults

Fixed: the setup in [src/config/defaults/10-10/](src/config/defaults) declared `name: "default:10-20"`, copied from the file it was derived from, so registering it alongside the real 10-20 setup would have collided — and `addSetup` answers a name collision by returning the setup already registered, discarding the second silently. Its label said `Default 10-20` for the same reason, and its AF row was written mixed-case where every other two-letter row is capitalised. It is now registered in `EegRecording.DEFAULT_MONTAGES` as `default:10-10` with its as-recorded montage, and [tests/defaultSetups.test.ts](tests/defaultSetups.test.ts) pins the identity of every bundled setup and montage.

What remains is a decision rather than a defect: `defaultSetups` still names the 10-20 setup alone, so a deployment that wants the 10-10 array adds one settings line. Shipping both by default would give every recording a second setup and 74 electrodes of channel matching it may have no signals for, which is why it is opt-in for now.

The other montages of the 10-10 array are not bundled — only `rec` exists. An average-reference, longitudinal and transverse montage over the larger array would each need writing, and [src/config/defaults.json](src/config/defaults.json) is a stale catalogue that names a `lpl` path which does not exist and calls the longitudinal montage `dbn`; nothing reads it.

## `channelTypeMatchers` is read by nothing

The setting is declared as a required field of `EegModuleSettings`, populated with a 10-20 label list in the module defaults, and consumed nowhere in the workspace — no package, no worker, no interface component reads it. Either something was meant to classify channels by it and does not, or the classification moved into the setup files and the setting outlived it.

Being inert, its content is also stale: the list carries the pre-1991 temporal names (`t3`–`t6`) and not the modern ones (`t7`, `t8`, `p7`, `p8`), which would matter the moment anything started reading it.

## `convertPatterns` wipes the fields its replacement omits

In the `events` setter, `annotator` is copied with `||` so an omitted one keeps the event's own, while `channels`, `class`, `priority`, `text` and `type` are assigned unconditionally — so a pattern that renames an event and says nothing else clears all five. The declared type is a full `BiosignalAnnotationEvent`, which makes the wipe defensible as "the replacement states everything", but the asymmetry with `annotator` says otherwise and a partial replacement is the natural thing for a deployment to write.

Current behaviour is pinned by [tests/EegRecordingEvents.test.ts](tests/EegRecordingEvents.test.ts), so changing it is a deliberate act rather than a silent one. Changing it would alter behaviour for any deployment relying on the wipe.

## The pyodide scripts are unreachable and unpublished

[src/pyodide/scripts/](src/pyodide) holds two Python scripts, a signal filter and a topomap loader. Nothing imports either — `pyodide-service` loads its own scripts with `?raw` from its own tree — and neither is named in the `files` list of the manifest, so they reach no consumer through the registry either. The topomap script is superseded in substance by [src/topography/](src/topography), which computes the same field natively.

Either wire them through the pyodide service the way that package loads its own, or drop them.

## `addSetup` treats a zero-rate channel asymmetrically

The common-sampling-rate loop skips a leading EEG channel whose rate is zero and then lets a trailing one zero the result: `if (!sr && chan.samplingRate)` passes over the first, while the `else if (sr !== chan.samplingRate)` branch takes a later zero as a disagreement and reports no common rate. A setup whose EEG channels carry one real rate plus an unassigned channel therefore answers `null` or `256` depending on the order the channels happen to be in, and the common rate is what the montage arithmetic and the derived trend epochs are computed against.

Deciding it needs an answer to what a zero-rate EEG channel means in a setup — an unmatched electrode, or a channel that genuinely carries no signal — which the setup format does not currently distinguish.

## A topogram with no electrodes renders a blank disc

`EegTopogram.forPositions([])` builds an operator over zero channels and interpolates every pixel to zero, so the result is a flat neutral disc inside the head circle — indistinguishable from a recording with no field. A montage whose channels all fail to resolve as scalp electrodes produces exactly that, and `resolveMontageElectrodes` can return an empty list. Refusing construction below some minimum electrode count would make the empty case visible to the caller.

## `releaseBuffers` drops annotations without announcing it

`EegRecording.releaseBuffers` empties `_events`, `_labels`, `_interruptions` and `_videos` by mutating them directly, so no property-change event is dispatched and a listener bound to `events` still believes it holds them. Reopening the recording re-reads the file's own annotations, but anything a user added in the session is gone with no notification. Whether that is right depends on whether a closed recording is expected to keep unsaved annotations at all, which is a question about the application rather than this package.

## Remaining test gaps

The suite covers the package at about 82 % of statements — of its own sources; the coverage config excludes `tests/`, since counting the core mocks as source reports a figure that does not describe what the package ships. The three areas still thin are all in `EegRecording`:

- `_applyDefaultMontages` and `addCascadeMontagesFromEntries`, which need a montage-construction harness rather than the property-level stubs the current mocks provide.
- `prepare()`, whose deferred-setup re-dispatch — a recording activated before it was prepared — is exactly the path that fails silently and is worth a test.
- The `signalCacheStatus` and `SIGNAL_CACHING_COMPLETE` listeners installed by `_completeSetup`, which drive progressive trend extension during a load.

The test mocks under [tests/mocks/](tests/mocks) are stubs of core rather than a build of it, so each is only as faithful as the behaviour a test has needed so far. [tsconfig.test.json](tsconfig.test.json) type-checks the suite against real core to stop a test asserting on a mock-only property, but it cannot tell a stub that defaults a field wrongly from one that defaults it right.

The memory-budget cases in [tests/EegRecordingSetup.test.ts](tests/EegRecordingSetup.test.ts) have a related limit worth knowing before trusting them. Most of them restate the implementation's own arithmetic, so they detect a change to it but cannot say the arithmetic is right; the block beside them asserts the properties instead — the allocation fits the budget, it is monotonic in the budget, and no channel is given more slots than it has samples — which is what would survive a legitimate reformulation. Extending that block is better value than adding another case that recomputes the formula.
