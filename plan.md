# Phase 3 UX Cleanup + Automatic Required Builds

## Objective

Finish the current Phase 3 implementation by:

1. simplifying the Release editor UI;
2. removing remaining silent/hidden choices;
3. automatically creating required Build Profiles when a destination needs one;
4. centralizing temporary build defaults so they can later be replaced by user preferences.

Do not redo already-completed Phase 3 architecture.

---

# Existing behavior to preserve

These are already implemented and are **not part of this task**:

* Wizard is `Details → Source → Destinations → Review`
* Wizard creates `builds: []`
* Destination slots support `input?: ReleaseOutputRef`
* Planner reports `release.destination.input.required`
* Compiler rejects unresolved routing
* Construct browser profiles come from `source.inspect()` using generic select options
* Planner issues have exact paths/severity
* Stale planner responses are ignored
* Autosave is serialized
* Automatic producers are hidden from configurable Build Profiles
* Planner/compiler/runtime remain authoritative for compatibility and execution

Do not regress these.

---

# 1. Introduce central release build defaults

We want missing required builds to be created automatically.

For now, use hardcoded sane defaults.

However, the defaults **must** live behind a small abstraction that can later read user settings without changing Release UI/planner integration.

Create something conceptually equivalent to:

```ts
export interface ReleaseBuildPreferences {
  buildTypes: Record<
    string,
    {
      engine?: string;
      targets?: string[];
    }
  >;
}
```

Provide one central fallback:

```ts
export const DEFAULT_RELEASE_BUILD_PREFERENCES: ReleaseBuildPreferences = {
  buildTypes: {
    desktop: {
      engine: "<electron producer id>",
      targets: ["<windows x64 target id>"],
    },
  },
};
```

Exact IDs should match the existing catalog definitions.

Expose through one function/service:

```ts
getReleaseBuildPreferences()
```

For now:

```ts
getReleaseBuildPreferences()
→ DEFAULT_RELEASE_BUILD_PREFERENCES
```

Later this function will read actual persisted user settings.

Do not scatter Electron/Windows defaults across Vue components.

---

# 2. Keep default selection outside planner semantics

The planner must continue answering:

```text
"This destination is not currently satisfied."
```

It must **not** become responsible for choosing Electron, Tauri, or another engine.

Default engine selection belongs to the Release configuration/editor layer.

Keep this distinction:

```text
Planner
→ identifies missing compatibility

Release editor/default resolver
→ chooses a configured default Build Profile to satisfy it

Planner
→ replans resulting configuration
```

Do not add hidden provider selection to `planRelease()`.

---

# 3. Automatically create required Build Profiles

When the Release editor loads or replans and a destination cannot be satisfied because a meaningful Build type is missing, automatically create the required Build Profile when a deterministic configured default exists.

Example:

```text
Source
Construct

Destinations
Steam
Poki
```

Desired result:

```text
Source
Construct

Builds
Desktop
Electron · Windows x64

Deploy
Poki  ← Source
Steam ← Desktop / Electron / Windows x64
```

No user click should be required just to create the obvious default Desktop build.

---

# 4. Auto-build rules

Automatic Build Profile creation must obey all of the following.

## Reuse existing builds first

Before creating anything:

* check whether an existing enabled Build Profile already exposes an output that can satisfy the destination;
* if yes, use/reuse it;
* do not create duplicate Desktop builds unnecessarily.

## Only create meaningful Build Profiles

Only create producers where:

```ts
planning.mode === "build"
```

Never create automatic plumbing producers as Build Profiles.

## Use explicit configured defaults

Resolve:

```text
required build type
→ user/default preference
→ engine
→ target(s)
```

Example:

```text
desktop
→ Electron
→ Windows x64
```

Do not choose `catalog.producers[0]`.

Do not choose `targets[0]` implicitly unless that target is specifically the configured fallback.

## Deterministic fallback

If the future user preference is invalid/unavailable:

```text
user preference
→ unavailable
→ central application fallback
```

Never fall back to arbitrary catalog ordering.

## Normal Build Profiles

Automatically-created builds must be ordinary persisted Build Profiles.

After creation they must support:

* edit;
* change engine;
* change targets;
* duplicate;
* disable;
* delete.

There should be no special "generated build" runtime model.

---

# 5. Auto-route destination after creating build

When a missing Build Profile is auto-created specifically to satisfy a destination:

1. create the Build Profile;
2. re-run the planner;
3. find the corresponding compatible public Build output;
4. assign that output to the destination slot;
5. re-run the planner again.

Do not manually construct `ArtifactRef` values.

Persist normal:

```ts
ReleaseOutputRef
```

references.

---

# 6. Source-direct destinations remain source-direct

Do not create unnecessary builds.

Example:

```text
Construct
→ Poki
```

If the Construct Source output already satisfies Poki:

```text
Poki ← Source
```

Do **not** create:

```text
Web Build
```

just because the destination is web-based.

Builds are only created when an additional meaningful build output is required.

---

# 7. Example: Construct + Steam + Poki

Starting configuration:

```text
Source
Construct

Builds
none

Destinations
Steam
Poki
```

Planner/editor resolution:

```text
Poki
→ Source is compatible
→ route Source

Steam
→ Source is not sufficient
→ Desktop build required
→ default Desktop preference = Electron / Windows x64
→ create Desktop Build Profile
→ replan
→ route Steam to Desktop / Windows x64
```

Final configuration:

```text
Construct
├─ Poki
└─ Desktop / Electron / Windows x64
   └─ Steam
```

---

# 8. Do not recreate deleted builds endlessly

If the user explicitly deletes an automatically-created Build Profile, do not immediately recreate it in an infinite reactive loop.

Auto-resolution needs a clear trigger.

Recommended behavior:

* perform automatic required-build completion when a release is initially created/opened with unrouted destinations;
* perform it when a destination is newly added;
* optionally expose `Use defaults` / `Fix automatically` later;
* do not continuously enforce defaults against explicit user changes.

Once the user begins editing the release, their explicit configuration wins.

Avoid:

```text
user deletes Desktop
→ watcher instantly recreates Desktop
→ user can never remove it
```

A deleted Build may leave the destination in `Needs attention` state.

---

# 9. Keep Create Compatible Build as fallback

Do not remove the existing manual flow.

If automatic creation cannot resolve the requirement because:

* no default exists;
* preferred engine is unavailable;
* no compatible target is available;
* compatibility is ambiguous;

show:

```text
No compatible output configured

[ Create compatible build ]
```

The manual dialog remains the fallback.

---

# 10. Remove silent Add Deployment routing

Separate from auto-required-build behavior:

do not use:

```ts
outputOptions[0]
```

when manually adding a deployment.

A manually-added deployment starts as:

```ts
input: undefined
```

unless the automatic resolution process has explicitly established the route.

Manual `Add deployment` must not arbitrarily choose Source or the first output.

---

# 11. Explicit Choose Output flow

For unresolved manual routing:

```text
Steam
Needs attention

No output configured

[ Choose output ]
```

Open:

```text
Choose output

Source — Construct
Desktop / Electron / Windows x64
Desktop / Tauri / Linux x64

[ Cancel ] [ Use output ]
```

Options come from planner outputs.

Do not implement compatibility logic in Vue.

---

# 12. Simplify main Source card

Main page should be summary-only.

Target:

```text
Construct project                         Ready
game.c3p

                                  [ Configure ]
```

Problem:

```text
Construct project               Needs attention
game.c3p

                                  [ Configure ]
```

Move exact field validation into the Source settings dialog.

---

# 13. Simplify Build cards

Remove from the main card:

* Engine dropdown;
* target toggles;
* Input dropdown;
* detailed planner messages.

Target:

```text
Desktop                                  Ready
Electron · Windows x64

                                  [ Configure ]
```

Problem:

```text
Desktop                        Needs attention
Electron · Windows x64

                                  [ Configure ]
```

Keep:

* name/type;
* engine summary;
* enabled target summary;
* Ready / Needs attention / Disabled;
* Configure;
* enable/disable;
* delete.

---

# 14. Move Build editing to settings dialog

Build settings owns:

```text
Engine
Targets
Input
Engine settings
Target settings
```

Example:

```text
Desktop

Engine
[ Electron ]

Targets
[x] Windows x64
[ ] Linux x64

Input
[ Source ]
```

Exact path-scoped planner diagnostics should appear beside controls here.

Do not duplicate them on the Build card.

---

# 15. Simplify Destination cards

Ready:

```text
Poki                                     Ready
Source
```

Ready build output:

```text
Steam                                    Ready
Desktop / Electron / Windows x64
```

Unresolved:

```text
Steam                          Needs attention
No output configured

[ Choose output ]
[ Create compatible build ]
```

Do not render a list of raw planner messages underneath each card.

---

# 16. Reduce global diagnostics noise

Replace the large issue wall with:

```text
⚠ 2 things need attention     [ View issues ]
```

The full issue list should be expandable/secondary.

Keep:

* complete planner messages;
* paths;
* warning/error severity.

But do not make them the primary page content.

---

# 17. Collapse Build Plan by default

Show:

```text
Build plan ▸
```

Expanded:

```text
Construct
↓
Automatic transform
↓
Desktop / Electron / Windows
↓
Steam
```

It stays read-only.

Automatic producers may appear here.

---

# 18. Clean obsolete browser-profile code

The working architecture is now:

```text
Construct source.inspect()
→ fieldOptions.profilePath
→ generic select
```

If still present, remove:

```ts
"browser-profile"
```

from `ReleaseFieldDefinition.type`.

Remove unused `BrowserProfilePicker.vue`.

Remove dead imports/references.

Do not modify the working Construct inspection behavior.

---

# 19. Future user preferences

Do **not** implement full user settings as part of this PR.

Only make the build-default abstraction ready for it.

The future setting should conceptually allow:

```text
Default Desktop build

Engine
Electron

Targets
Windows x64
Linux x64
```

The current code should already consume the same preference shape so future persistence only replaces:

```ts
getReleaseBuildPreferences()
```

implementation.

A ClickUp task already tracks this follow-up:

`Add user preferences for default release builds`

Do not expand current Phase 3 scope into a Settings redesign.

---

# 20. Tests

Add focused tests for the new behavior.

## Automatic required builds

* Construct + Poki does not create a Build Profile.
* Construct + Steam creates the configured default Desktop Build Profile.
* Construct + Steam + Poki creates exactly one Desktop Build Profile.
* Steam routes to the generated Desktop output.
* Poki remains routed directly to Source where compatible.
* Existing compatible Desktop profile is reused.
* Duplicate Desktop profiles are not created unnecessarily.
* Automatic producers are never persisted as Build Profiles.
* Invalid preferred engine falls back deterministically.
* No fallback uses catalog array order.

## User control

* Automatically-created build is a normal editable Build Profile.
* Deleting a generated build does not immediately recreate it in a reactive loop.
* Removing it can leave the destination unresolved.
* Manual Create Compatible Build remains available.

## Routing

* Manual Add Deployment does not use `outputOptions[0]`.
* Unresolved manual deployment has `input === undefined`.
* Choose Output persists only after confirmation.

## UX

* Main Source card is compact.
* Main Build card has no inline Engine/Input/Target editing.
* Main Destination card is compact.
* Detailed issues live in settings UI.
* Global diagnostics are secondary/collapsed.
* Build Plan starts collapsed.

## Existing guarantees

Keep existing tests for:

* missing destination input planner error;
* compiler rejection;
* planner race protection;
* serialized autosave;
* field-level issue paths.

---

# TODO

## Default build preferences

* [x] Add `ReleaseBuildPreferences` abstraction
* [x] Add central hardcoded fallback preferences
* [x] Add `getReleaseBuildPreferences()`
* [x] Configure Desktop fallback to Electron
* [x] Configure sane default Desktop target
* [x] Ensure no defaults are duplicated in Vue/planner code

## Automatic required builds

* [x] Detect destination requirement that needs an additional Build Profile
* [x] Reuse compatible existing Build Profiles first
* [x] Resolve preferred engine from central preferences
* [x] Resolve preferred target(s)
* [x] Create missing Build Profile when deterministic
* [x] Re-run planner after Build creation
* [x] Route destination to newly-created output
* [x] Persist resulting normal ReleaseConfig
* [x] Avoid duplicate generated builds
* [x] Never create automatic producers as builds

## Explicit user ownership

* [x] Avoid continuous auto-recreation after user deletes/changes a build
* [x] Define safe triggers for automatic completion
* [x] Keep unresolved state when user explicitly removes required build
* [x] Preserve manual `Create compatible build`

## Destination routing cleanup

* [x] Remove remaining `outputOptions[0]`
* [x] Keep unresolved manual slots as `input: undefined`
* [x] Add explicit Choose Output dialog
* [x] Persist selection only after confirmation

## Main UI cleanup

* [x] Compact Source card
* [x] Compact Build cards
* [x] Compact Destination cards
* [x] Remove Engine dropdown from Build card
* [x] Remove inline target toggles
* [x] Remove inline Build Input selector
* [x] Remove repeated raw planner messages
* [x] Keep Ready / Needs attention / Disabled states

## Build settings

* [x] Move Engine control into settings
* [x] Move Targets into settings
* [x] Move Input into settings
* [x] Keep engine fields in settings
* [x] Keep target fields in settings
* [x] Keep exact field-level planner issues

## Diagnostics

* [x] Replace global issue wall with compact issue count
* [x] Add expandable `View issues`
* [x] Preserve warning/error severity
* [x] Collapse Build Plan by default

## Cleanup

* [ ] Remove obsolete `browser-profile` field type if unused
* [ ] Remove dead BrowserProfilePicker component
* [ ] Remove dead imports/references
* [ ] Keep Construct inspection behavior unchanged

## Tests

* [ ] Test Construct → Poki: no build created
* [ ] Test Construct → Steam: Desktop default created
* [ ] Test Construct → Steam + Poki: one Desktop build
* [x] Test existing compatible build reuse
* [x] Test deterministic fallback defaults
* [x] Test no automatic producer becomes Build Profile
* [ ] Test generated build remains editable/removable
* [ ] Test deleted generated build is not instantly recreated
* [x] Test explicit deployment routing
* [ ] Test compact UI
* [ ] Preserve planner/compiler/autosave tests

## Verification

* [ ] UI tests
* [ ] Shared planner/compiler tests
* [ ] Typecheck
* [ ] Lint
* [ ] Full CI
* [ ] Manually test Construct → Poki
* [ ] Manually test Construct → Steam
* [ ] Manually test Construct → Steam + Poki
* [ ] Change auto-created Electron build to Tauri manually
* [ ] Delete auto-created Desktop build and confirm it stays deleted
* [ ] Confirm unresolved Steam state becomes actionable rather than noisy

## Future work — already tracked in ClickUp

* [ ] Implement actual user settings for preferred build engine/targets
* [ ] Replace hardcoded fallback implementation inside `getReleaseBuildPreferences()`
* [ ] Keep Release editor/default-resolution code unchanged when settings land
