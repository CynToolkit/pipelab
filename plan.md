# Release Built-ins & Filesystem Cleanup

Goal: remove the Filesystem **plugin abstraction** from the new Release architecture while preserving the reusable filesystem/archive capabilities and all legacy compatibility.

PR #96 is considered complete; do not mix further Build Input UX work into this task.

## 1. Treat filesystem operations as internal workflow primitives

For the new Release engine, operations such as:

* copy
* remove
* zip
* unzip
* passthrough
* run command

are execution primitives, not user-facing plugins.

Move/reuse them through the workflow/runtime task layer where appropriate.

There is already precedent:

* `@pipelab/core/passthrough` is registered as a core workflow task.
* `filesystem:zip` already exists as a core-node workflow task.
* `workflow-runtime` already owns a standalone `fs:run` task.

Avoid creating a second abstraction.

The end state should conceptually be:

```text
Release compiler
      │
      ├── normal Release operations
      │
      └── future hooks
               │
               ▼
      workflow primitives
 copy / remove / zip / unzip /
 passthrough / run command / ...
```

Do **not** implement hooks in this task.

## 2. Keep Folder and ZIP as built-in Release capabilities

These are legitimate user-facing Release choices and should remain available:

Sources:

* Folder
* Web app folder
* ZIP
* Web app ZIP

Destinations:

* Folder
* ZIP

They should no longer conceptually require a user-facing "Filesystem plugin".

Move their Release definitions into an appropriate built-in Release module owned by the new engine/core layer.

Important: preserve persisted ReleaseConfig compatibility.

Existing workflows currently store provider IDs such as:

```text
@pipelab/plugin-filesystem/folder-source
@pipelab/plugin-filesystem/web-folder-source
@pipelab/plugin-filesystem/zip-source
@pipelab/plugin-filesystem/web-zip-source
@pipelab/plugin-filesystem/folder-destination
@pipelab/plugin-filesystem/zip-destination
```

Do not rename those IDs casually.

Prefer keeping the existing IDs as stable compatibility identifiers even if their implementation moves out of `plugin-filesystem`.

If changing persisted IDs becomes desirable later, that requires an explicit ReleaseConfig migration/version decision and is outside this cleanup.

## 3. Internalize automatic planner plumbing

The automatic unzip producer and passthrough producer are invisible planner plumbing.

They should not depend conceptually on the Filesystem plugin.

Move them to built-in/internal Release planning definitions.

Preserve behavior:

```text
Web ZIP source
      ↓
automatic unzip
      ↓
Electron/Tauri
```

The automatic transform must remain invisible in normal user configuration.

`passthrough` should clearly live under core/internal ownership.

## 4. Keep `plugin-filesystem` as a legacy compatibility shell

Do **not** delete the package yet.

Legacy Pipeline/SavedFile data may still reference node IDs such as:

```text
fs:copy
fs:remove
fs:run
unzip-file-node
zip-node
zip-v2-node
fs:open-in-explorer
```

Keep those registrations working exactly as they do today.

The package can become effectively:

```text
plugin-filesystem
└── legacy pipeline compatibility
```

The new Release system should stop depending on it.

Do not modernize the legacy Pipeline implementation while doing this.

Do not migrate old Pipeline/SavedFile documents.

Once the legacy Pipeline system is eventually removed, `plugin-filesystem` can be deleted entirely.

## 5. Separate operations that were incorrectly grouped under "Filesystem"

Do not preserve historical categorization just because it exists today.

### Run Command

`Run Command` is a generic workflow primitive, not a filesystem feature.

Preserve it.

It will likely be useful for the future hook system:

```text
after build
→ run ./sign-build.sh
```

But do not design or implement hook configuration yet.

### Open in Explorer

`Open in Explorer` is desktop/UI functionality rather than Release workflow plumbing.

Keep it only where legacy/UI behavior currently requires it.

Do not promote it into the new Release primitive layer without an actual use case.

### ZIP / unzip

Treat archive transformation as internal artifact/workflow functionality rather than a plugin feature.

Reuse existing implementations rather than maintaining parallel Release-specific and plugin-specific implementations when practical.

## 6. Prepare clean boundaries for future hooks — without implementing hooks

Future hooks will allow users to modify behavior around lifecycle points such as:

```text
before source
after source

before build
after build

before upload
after upload
```

Hooks may eventually use primitives such as:

```text
copy files
remove files
zip/unzip
run command
```

Therefore the primitive task layer should be reusable independently of Release providers and independently of the legacy plugin system.

Do not add:

* hook schemas;
* hook persistence;
* hook UI;
* lifecycle execution points;
* user-facing hook configuration.

Only avoid architectural choices that would force these primitives back through `plugin-filesystem` later.

## 7. Remove the new Release dependency on the Filesystem plugin

After moving the relevant definitions/tasks:

* the Release catalog/planner/compiler must work without obtaining filesystem Release definitions from `plugin-filesystem`;
* automatic unzip must still resolve correctly;
* Folder/ZIP sources and destinations must still work;
* compiled workflows must resolve all required tasks;
* legacy filesystem nodes must continue to register.

Do not remove `filesystemPlugin` from the bundled plugin registry if doing so would break legacy pipelines.

The goal is to remove the **new Release dependency**, not legacy registration.

## 8. Tests

Focused coverage added and passing:

* [x] Folder, Web folder, and ZIP sources plan and compile without Filesystem plugin Release registration.
* [x] Folder and ZIP destinations plan and execute through core workflow tasks.
* [x] Web ZIP → automatic unzip → Electron executes successfully.
* [x] Construct source extraction uses the core unzip task.
* [x] Passthrough remains internal and resolvable.
* [x] Legacy filesystem node IDs remain registered and usable.

Keep Release/workflow integration execution tests under `apps/cli/tests/e2e` according to repository policy.

Keep pure primitive/helper tests package-local.

## 9. Verification

Local verification completed:

* [x] Shared tests and typecheck.
* [x] Workflow-runtime tests and typecheck.
* [x] Core-node tests and typecheck.
* [x] CLI Release E2E tests.
* [x] UI tests and typecheck.
* [x] Repository lint.
* [x] Repository build.
* [x] `git diff --check`.

* [ ] Confirm exact-head CI is green. The branch is pushed, but this workflow runs for PRs targeting `main` or `develop`; no PR has been opened for this branch.

## Scope

Do not:

* implement the hook system;
* redesign the workflow runtime;
* break or migrate legacy Pipeline/SavedFile data;
* silently rename persisted Release provider IDs;
* expose copy/zip/unzip/passthrough as configurable Release builds;
* remove Folder/ZIP as user-facing Release source/destination choices;
* delete `plugin-filesystem` while legacy pipelines still depend on its node IDs.

Target architecture:

```text
New Release
├── built-in Folder/ZIP providers
├── internal automatic transforms
└── workflow primitives

Future hooks
└── same workflow primitives

Legacy Pipeline
└── plugin-filesystem compatibility shell
```

The Filesystem **plugin** becomes legacy-only; the useful filesystem/archive capabilities remain reusable infrastructure.
