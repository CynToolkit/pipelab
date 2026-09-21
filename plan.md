# Phase 3 Final Fixes — Planner-Authoritative Auto Builds + UX Cleanup

## Objective

Fix the remaining blockers in the current PR #93 implementation without redoing completed Phase 3 work.

Focus only on:

1. making automatic required-build creation planner-authoritative;
2. fixing destination creation so auto-resolution actually runs;
3. making Add Build defaults visible;
4. removing the reintroduced Construct-specific field UI;
5. restoring field-level validation inside settings dialogs;
6. using normal opaque Build Profile IDs.

Do not redesign the planner, compiler, runtime, wizard, autosave, or compact card UI.

---

# Existing work to preserve

Already implemented and must remain:

* intent-only creation wizard;
* compact Source / Build / Destination cards;
* collapsed Build Plan;
* optional destination slot input;
* explicit Choose Output flow;
* central `ReleaseBuildPreferences`;
* `getReleaseBuildPreferences()`;
* Desktop fallback preference = Electron + Windows x64;
* automatic required-build completion trigger;
* no continuous recreation after explicit deletion;
* serialized autosave;
* stale planner request protection;
* generic Construct `source.inspect()` field options;
* compiler rejection of unresolved releases.

---

# 1. Make automatic required-build creation planner-authoritative

## Problem

Current `resolveMissingDestinationInputs()` decides compatibility in the UI/model layer using catalog descriptors and `evaluateArtifactAcceptance()`.

That is insufficient because:

* it bypasses executable `acceptsWhen`;
* it only checks whether the Build output can satisfy the destination;
* it does not guarantee the preferred engine can consume the actual upstream artifact;
* it can therefore create an invalid default Build Profile.

Example to avoid:

```text
Godot project
→ Steam requires desktop
→ preference says Electron
→ Electron output would satisfy Steam
→ UI creates Electron
```

Electron cannot consume a Godot project, so this must not happen.

## Required architecture

Do not duplicate planner compatibility logic in Vue/model helpers.

The flow must be:

```text
Unresolved destination
→ identify preferred build candidate
→ tentatively add candidate to a cloned config
→ call backend planner
→ accept candidate only if planner resolves it successfully
→ persist candidate + route
```

The planner/backend remains the authority for:

* producer input compatibility;
* automatic transforms;
* dynamic `acceptsWhen`;
* target compatibility;
* availability;
* destination compatibility.

---

# 2. Add a backend-assisted default-resolution operation

Preferred implementation: create one generic backend API for resolving default configuration additions.

Conceptually:

```ts
release:resolve-defaults(config, preferences)
```

Return something like:

```ts
interface ReleaseDefaultResolution {
  config: ReleaseConfig;
  changed: boolean;
}
```

or equivalent.

Backend implementation may internally:

```text
plan original config
→ find enabled unrouted destination slots
→ try existing public outputs
→ try configured preferred Build Profile candidates
→ plan each tentative configuration
→ keep only candidates accepted by planner
→ assign resulting ReleaseOutputRef
→ return updated config
```

Do not return compiler/internal `ArtifactRef` values to the UI.

Persist normal `ReleaseOutputRef`.

If adding a new API is unnecessary because an existing backend planning API can cleanly support the same loop, reuse it.

The important constraint is:

> Candidate validation must execute through the real planner, not catalog-only UI logic.

---

# 3. Preferred Build candidate selection

The preference layer may choose which candidate to try first.

Keep:

```ts
getReleaseBuildPreferences()
```

Current fallback remains:

```text
desktop
→ Electron
→ Windows x64
```

Preference selection is allowed to decide:

```text
build type
engine
target(s)
```

It is NOT allowed to decide whether that Build is actually compatible.

Compatibility decision belongs to the planner.

---

# 4. Determining which build type to try

Do not introduce a generic rule like:

```text
destination failed
→ always try desktop
```

Use configured preference candidates only where their target output could plausibly satisfy the destination, then confirm with the planner.

Current preferences may only contain Desktop.

That is fine.

If no preferred Build candidate can be validated:

```text
destination remains unresolved
→ Needs attention
→ Create compatible build
```

Do not invent another engine from catalog ordering.

---

# 5. Reuse existing compatible outputs first

Before creating a Build Profile:

1. re-plan current config;
2. use an existing compatible public planner output if available;
3. route the destination to it;
4. only create a new preferred Build if no existing output resolves the requirement.

Do not create duplicate Desktop profiles unnecessarily.

---

# 6. Generated Build Profiles use opaque IDs

Do not create semantic IDs such as:

```text
desktop-default
electron-default
```

Use the same normal ID generation strategy as manually-created Build Profiles.

Example:

```ts
nanoid()
```

or the existing project-standard generator.

The identity must not encode:

* build type;
* engine;
* target;
* "default" status.

Meaning stays in:

```ts
build.type
build.engine
build.targets
```

Generated profiles are ordinary Build Profiles after creation.

---

# 7. Fix destination creation

## Problem

Adding a destination currently creates:

```ts
slots: []
```

but automatic resolution operates on enabled slots with missing `input`.

The planner therefore emits:

```text
release.destination.slot.required
```

instead of:

```text
release.destination.input.required
```

and the auto-resolution path cannot run.

## Fix

When adding a destination from the editor, create one normal unrouted enabled slot:

```ts
{
  id: <unique slot id>,
  enabled: true,
  input: undefined,
  config: {}
}
```

Use provider/default slot configuration if the existing destination abstraction supplies one.

Do not route it yet.

Then trigger the default-resolution operation.

Expected:

```text
Add Steam
→ Steam slot exists but is unrouted
→ resolver runs
→ default Desktop candidate is validated by planner
→ Build created if valid
→ Steam routed
```

---

# 8. Preserve explicit manual deployment creation

The separate `Add deployment` action should remain explicit.

It must create:

```ts
input: undefined
```

and not automatically use:

```ts
outputOptions[0]
```

Manual deployment creation is different from automatic completion triggered by adding a destination.

Do not reintroduce arbitrary routing.

---

# 9. Fix Add Build target visibility

## Problem

`createBuildProfile()` enables the first target by default, while the Add Build dialog can visually show no selected target.

That means persisted state does not match what the user saw.

## Fix

When:

```text
Build Type selected
+
Engine selected
```

visibly select the intended target in `newBuildTarget`.

For now:

```text
first valid target
```

is acceptable for the manual Add Build dialog as long as it is visibly selected.

Better if the existing preference helper can supply the target when relevant.

Required:

```text
Type
Desktop

Engine
Electron

Target
Windows x64   ← visibly selected
```

`Add build` must be disabled when the engine has targets but none is selected.

Do not persist an invisible target selection.

---

# 10. Remove reintroduced `browser-profile` generic UI

The generic release field renderer must not contain Construct-specific behavior.

Remove:

```ts
"browser-profile"
```

from:

```ts
ReleaseFieldDefinition.type
```

if no remaining provider uses it.

Remove from `ReleaseFieldControl.vue`:

```vue
<BrowserProfilePicker ... />
```

Remove:

```ts
import BrowserProfilePicker ...
```

Delete the component if unused.

Construct must continue using:

```text
source.inspect()
→ fieldOptions.profilePath
→ generic select
```

Construct source field remains conceptually:

```ts
{
  key: "profilePath",
  type: "select",
  label: "Browser profile"
}
```

Do not modify the working browser-profile discovery backend.

---

# 11. Restore field-level validation inside settings dialogs

## Problem

The compact main page is correct, but detailed path-scoped errors were removed too aggressively.

The main page should stay clean.

The settings dialogs should still show exact validation beside affected controls.

## Source settings

Map:

```text
source.config.<field>
source.<field>
```

to the corresponding `ReleaseFieldControl`.

## Build settings

Map:

```text
builds.N.engine
```

to Engine.

Map:

```text
builds.N.input
```

to Input.

Map:

```text
builds.N.config.<field>
```

to engine setting.

Map:

```text
builds.N.targets.M...
```

to target/target setting.

## Destination settings

Map:

```text
destinations.N.config.<field>
```

to destination setting.

## Deployment settings

Map:

```text
destinations.N.slots.M.input
```

to Output.

Map:

```text
destinations.N.slots.M.config.<field>
```

to deployment setting.

---

# 12. Extend generic field control for validation

Preferred approach:

```ts
interface ReleaseFieldControlProps {
  ...
  issues?: ValidationIssue[];
}
```

Render small field-local messages below the control.

Preserve severity:

```text
error
warning
```

Do not put those detailed messages back on main cards.

Main page remains:

```text
Needs attention
```

with optional diagnostics modal.

---

# 13. Keep compact cards unchanged

Do not undo the current simplified card work.

Build card should remain approximately:

```text
Desktop                                  Ready
Electron · Windows x64

                                  [ Configure ]
```

Destination:

```text
Steam                                    Ready
Desktop / Electron / Windows x64
```

or:

```text
Steam                          Needs attention
No output configured

[ Choose output ]
[ Create compatible build ]
```

Do not restore inline Engine, Targets, Input, or raw issue lists.

---

# 14. Keep Build Plan collapsed

Preserve current:

```text
Build plan
[ View plan ]
```

or equivalent collapsed behavior.

Do not expand automatically.

---

# 15. Auto-resolution trigger rules

Automatic default completion must run only on intentional lifecycle triggers.

Keep/implement triggers such as:

```text
initial editor open for newly-created/unresolved release
new destination added
```

Do NOT run it after every reactive planner refresh.

Do NOT recreate a Build immediately after the user deletes it.

Example:

```text
auto-created Desktop
→ user deletes Desktop
→ Steam becomes unresolved
→ Desktop stays deleted
```

The user can then use:

```text
Create compatible build
```

or another explicit repair action.

---

# 16. Auto-resolution algorithm

Use this sequence:

```text
1. Plan current configuration.

2. For every enabled unrouted destination slot:

   a. Try compatible existing planner outputs.
      If exactly usable, route it.

   b. Otherwise inspect configured default Build preferences.

   c. Construct one tentative Build Profile using:
      - preferred build type
      - preferred engine
      - preferred target(s)
      - opaque ID

   d. Clone config and add candidate.

   e. Run planner on tentative config.

   f. Verify:
      - candidate Build resolves successfully;
      - expected target appears in planner outputs;
      - destination accepts/routes to that output;
      - no candidate-specific blocking error exists.

   g. Only then mutate/persist real config.

3. Re-plan final configuration.

4. Leave unresolved destinations untouched when no deterministic
   valid default exists.
```

Do not infer semantic meaning from files.

Do not inspect source contents to decide Build type/engine.

---

# 17. Tests — planner-authoritative defaults

Add focused tests for:

### Construct → Steam

```text
Construct web source
→ preferred Electron / Windows
→ planner accepts Electron input
→ Desktop Build created
→ Steam routed
```

### Construct → Poki

```text
Construct web source
→ Source already compatible
→ no Build created
→ Poki routed to Source
```

### Construct → Steam + Poki

```text
exactly one Desktop Build created
Steam → Desktop
Poki → Source
```

### Godot project → Steam

Important regression test:

```text
Godot project
→ preference Desktop/Electron
→ Electron cannot consume Godot project
→ Electron must NOT be created
```

If an existing valid Godot Desktop configuration/default is not configured:

```text
Steam remains unresolved
```

This test is mandatory.

### Existing compatible Build

```text
existing Desktop output
→ reuse it
→ no duplicate Build
```

### Dynamic acceptance

Use fake provider with `acceptsWhen`.

Ensure automatic default resolution honors planner dynamic acceptance and cannot bypass it.

---

# 18. Tests — destination creation

Test:

```text
add destination
→ one enabled slot
→ input === undefined
```

Then:

```text
default resolver
→ may resolve that slot
```

Do not create `slots: []`.

---

# 19. Tests — Add Build UI

Test:

```text
choose Desktop
choose Electron
→ Windows x64 visibly selected
```

Test Add button requires a visible valid target when targets exist.

Test persisted Build target matches the visible selection.

---

# 20. Tests — generic fields

Assert generic release UI no longer references:

```text
browser-profile
BrowserProfilePicker
construct:profiles:discover
```

Construct still receives browser profile options through source inspection.

---

# 21. Tests — field diagnostics

Verify issues are visible in dialogs for:

```text
source config field
build engine
build input
build config field
target config field
destination config field
slot input
slot config field
```

Verify warning/error severity.

Verify main cards do not render those detailed messages inline.

---

# Non-goals

Do not:

* implement actual persisted user build preferences yet;
* redesign Settings;
* move engine defaults into planner semantics;
* add source-content detection;
* make planner choose a preferred engine;
* change compiler/runtime architecture;
* rework the wizard again;
* re-expand main cards;
* continuously enforce generated defaults after user edits.

The existing ClickUp task tracks persisted user preferences separately.

---

# TODO

## Planner-authoritative auto-resolution

* [x] Remove catalog-only compatibility decisions from automatic Build creation
* [x] Ensure automatic candidate validation goes through backend `planRelease`
* [x] Add/reuse backend API for default resolution
* [x] Keep `ReleaseOutputRef` as persisted routing representation
* [x] Honor dynamic `acceptsWhen`
* [x] Validate preferred Build input compatibility through planner
* [x] Validate preferred Build target/destination compatibility through planner
* [x] Reuse existing planner outputs before creating new Builds
* [x] Leave unresolved when no valid deterministic default exists

## Build preferences

* [x] Keep `ReleaseBuildPreferences`
* [x] Keep `getReleaseBuildPreferences()`
* [x] Keep Desktop → Electron → Windows x64 fallback
* [x] Use preferences only for candidate selection
* [x] Do not move engine selection semantics into planner
* [x] Do not fall back to catalog array order

## Build IDs

* [x] Replace `desktop-default` style IDs
* [x] Generate normal opaque Build Profile IDs
* [x] Ensure generated profiles behave exactly like manual profiles

## Destination creation

* [x] Add destination with one enabled unrouted slot
* [x] Set `input: undefined`
* [x] Trigger default resolution after destination creation
* [x] Ensure planner reports input requirement instead of slot-required error

## Manual deployment routing

* [x] Preserve explicit `Add deployment`
* [x] Preserve `input: undefined`
* [x] Preserve explicit Choose Output dialog
* [x] Do not use `outputOptions[0]`

## Add Build dialog

* [x] Visibly preselect default/first valid target after engine selection
* [x] Keep engine selection explicit
* [x] Disable Add Build if required target selection is missing
* [x] Ensure persisted target matches visible selection

## Generic field cleanup

* [x] Remove `"browser-profile"` from `ReleaseFieldDefinition.type`
* [x] Remove BrowserProfilePicker branch from `ReleaseFieldControl`
* [x] Remove BrowserProfilePicker import
* [x] Delete unused BrowserProfilePicker component
* [x] Keep Construct browser options through `source.inspect()`
* [x] Confirm generic release UI contains no Construct-specific code

## Field-level validation

* [x] Add `issues` support to generic `ReleaseFieldControl`
* [x] Restore Source field errors in Source settings
* [x] Restore Engine errors in Build settings
* [x] Restore Build Input errors
* [x] Restore Build config field errors
* [x] Restore target field errors
* [x] Restore destination config field errors
* [x] Restore deployment Output errors
* [x] Restore deployment field errors
* [x] Preserve error/warning severity
* [x] Keep detailed diagnostics off main cards

## UX preservation

* [x] Keep compact Source card
* [x] Keep compact Build cards
* [x] Keep compact Destination cards
* [x] Keep Needs attention action
* [x] Keep Build Plan collapsed
* [x] Do not reintroduce inline configuration controls

## Auto-resolution lifecycle

* [x] Run on initial unresolved release open where appropriate
* [x] Run when destination is newly added
* [x] Do not run continuously after every edit
* [x] Do not recreate deleted generated Builds automatically
* [x] Keep Create compatible build manual fallback

## Regression tests

* [x] Construct → Poki: Source route, no Build
* [x] Construct → Steam: Electron Desktop created
* [x] Construct → Steam + Poki: exactly one Desktop Build
* [x] Existing compatible Build reused
* [x] Godot → Steam does NOT incorrectly create Electron
* [x] Dynamic `acceptsWhen` respected
* [x] Add destination creates one unrouted slot
* [x] Add Build target is visibly selected
* [x] Persisted target matches UI selection
* [x] Generic UI contains no browser-profile special case
* [x] Field-level validation visible only in settings
* [x] Generated Build uses opaque ID
* [x] Deleted generated Build is not immediately recreated

## Verification

* [x] Run UI tests
* [x] Run shared planner/compiler tests
* [x] Run core-node integration tests
* [x] Run typecheck
* [x] Run lint
* [ ] Run full CI
* [ ] CLI release integration scenarios pass
* [ ] UI unit/component tests pass
* [ ] Desktop make/package succeeds on supported platforms
* [x] Electron runtime smoke disabled intentionally
