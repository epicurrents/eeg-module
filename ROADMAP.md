# @epicurrents/eeg-module — roadmap

Findings carried in from the audits of the sibling packages, recorded here so they survive until this package's own audit opens it. The package has not been audited itself, so this is not a complete list of what is open — only of what is already known.

## `fromTemplate` turns a falsy option into a default

[EegLabel.fromTemplate](src/components/EegLabel.ts) and [EegEvent.fromTemplate](src/components/EegEvent.ts) copy twenty template fields through `tpl.x || undefined`. For a string or an array the two operators agree, but for a boolean or a number they do not: `||` maps `false`, `0` and `''` to `undefined`, and the annotation constructors read an absent option as "use the default".

`GenericAnnotation` resolves `this._visible = options?.visible ?? true`, so a template that marks an annotation hidden produces a visible one. `GenericBiosignalEvent` assigns `this._opacity = options.opacity` unguarded, so `opacity: 0` reaches the renderer as `undefined` and is drawn at whatever the renderer defaults to. The remaining falsy-capable fields — `locked`, `priority`, `background` — resolve to the same value either way and are unaffected today, which is the reason the whole set should change rather than the two that currently bite.

The fix is `??` throughout, which is what acc-module's equivalents now use. The same defect is live in emg-module and ncs-module.

The existing tests do not catch it and would not: [tests/EegLabel.test.ts](tests/EegLabel.test.ts) and [tests/EegEvent.test.ts](tests/EegEvent.test.ts) each build a template from truthy fields only, which is exactly the case where `||` and `??` agree. A regression test has to pass `visible: false`.

## Linting runs on the pre-flat-config toolchain

The package declares eslint `^8.55.0` with `@typescript-eslint` 6 and configures it through [.eslintrc.cjs](.eslintrc.cjs). It does run — `eslint src` reports one `ban-types` error in [src/types/index.ts](src/types/index.ts) — but against a rule set far thinner than the flat config core now carries, which reported findings in the hundreds when it first reached acc-module.

Migrating means the same three steps the audited packages took: copy core's flat config, move to eslint 9 with the current `@typescript-eslint`, and delete the eslintrc. Expect the first run to report a large number of findings; triaging them is the work, not the migration.

## The declared core range excludes the core this builds against

`package.json` asks for `@epicurrents/core: ^1.0.0` in both `devDependencies` and `peerDependencies`, and core is at 2.0.0. The workspace symlink resolves core from the checkout regardless, so nothing fails locally and the range is only load-bearing for a consumer installing from the registry.

Fifteen of the seventeen dependent packages carry the same stale range; only the two opened by the current audit sweep have been moved to `^2.0.0`. The family view of it is in the builder's roadmap.
