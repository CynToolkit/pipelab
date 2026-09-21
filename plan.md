Phase 3 UX Correction — Intent-First Release Creation
Objective

Simplify release creation so the wizard captures only what the user wants to ship, while the full Release editor handles how it gets built.

Replace:

Details
→ Source
→ Build & deploy
→ Review

with:

Details
→ Source
→ Destinations
→ Review

The creation wizard must not expose producers, engines, automatic transforms, targets, or Build Profiles.

Product rule

The responsibilities are:

Creation wizard
→ capture release intent

Planner
→ determine what is already compatible and what is missing

Release editor
→ configure builds, engines, targets and routing

Example:

Source: Construct

Destinations:
- Steam
- Poki

After creation:

Construct source
├─ Poki ✓
└─ Steam
   └─ Desktop-compatible output required
      [ Create compatible build ]

The wizard must not silently create Electron, Tauri, Godot, unzip, passthrough, or any other producer.

1. Remove Build & Deploy from the wizard

Remove the current producer cards entirely.

The wizard must never display things such as:

Passthrough
Extract ZIP
Electron
Tauri
Godot exporter

Those are implementation details.

Automatic producers are planner plumbing.

Build engines belong in the Release editor.

2. Step 3 becomes Destinations

Display only entries from:

catalog.destinations

UX:

Where do you want to ship?

[✓] Steam
[✓] Poki
[ ] Itch.io
[ ] Folder
[ ] ZIP

Allow selecting multiple destinations.

Do not show compatibility filtering here unless it comes directly from planner output.

Do not require the release to already be executable.

3. Destination creation

For each selected destination, persist:

{
  id,
  provider,
  enabled: true,
  config: {
    ...destination.defaultConfig
  },
  slots: ...
}

Do not choose:

outputOptions[0]

Do not default to:

{ source: true }

unless Source was explicitly selected as the route.

A destination may be created in an unconfigured routing state.

4. Support unrouted destinations explicitly

The current model assumes:

ReleaseDestinationSlot.input: ReleaseOutputRef

That forces the UI to invent an input.

Change the model so an unconfigured slot can exist explicitly.

Preferred:

interface ReleaseDestinationSlot {
  id: string;
  enabled: boolean;
  input?: ReleaseOutputRef;
  config: Record<string, unknown>;
}

Planner behavior:

enabled destination slot
+ no input
→ release.destination.input.required

This is a normal validation issue, not malformed configuration.

Compiler still refuses plans containing errors.

Do not represent missing routing using fake Source references.

5. Review step

The final wizard step should summarize intent only.

Example:

New release

Details
My Game — Production

Source
Construct project
game.c3p

Destinations
✓ Steam
✓ Poki

If planner information is available, show useful status:

Poki
✓ Source can be used directly

Steam
⚠ Additional build configuration required

Do not solve the missing build from the wizard.

Primary action:

Create release
6. Open the Release editor after creation

Immediately navigate to the normal Release editor.

The editor becomes responsible for completing the graph.

Example:

Steam

⚠ No compatible output selected.

Steam requires an application output compatible
with this destination.

[ Create compatible build ]

If Source already satisfies another destination:

Poki

✓ Construct source
Web application

No fake Web Build Profile should be created.

7. Create compatible build

Create compatible build should open the normal Add Build flow.

Example:

Create build

Type
Desktop

Engine
[ Electron ▾ ]

Targets
☑ Windows x64
☐ Linux x64
☐ macOS

                    Add build

This is an explicit user action.

The UI may preselect sensible values inside this dialog, but must not persist them until the user confirms.

No planner-selected engine.

8. Add Build flow

The full editor should own:

Add Build
→ Build Type
→ Engine
→ Targets
→ Add

Then detailed configuration can happen through the normal Build Profile settings.

Support:

Add
Duplicate
Delete
Enable/disable
Change engine
Change targets
Configure build
Configure target

Multiple profiles of the same type remain valid.

9. Fix generic release fields

Remove the Construct-specific:

type: "browser-profile"

frontend behavior.

The generic Release UI must not call:

construct:profiles:discover

Instead, Construct should expose browser profile choices through its provider inspection.

Conceptually:

Construct source.inspect()
→ discover profiles
→ fieldOptions.profilePath

And its catalog field should remain generic:

{
  key: "profilePath",
  type: "select",
  label: "Browser profile"
}

Then:

ReleaseFieldControl
→ generic Select

No Construct-specific Vue component or IPC knowledge in the generic Release editor.

10. Field-level planner issues

Use ValidationIssue.path precisely.

Current behavior of showing everything at card level is insufficient.

Example:

destinations.0.slots.0.input

must place the error beside the Output selector.

Similarly:

builds.1.targets.0.config.preset

must appear beside that target field.

Extend ReleaseFieldControl to accept issues:

issues?: ValidationIssue[]

Render:

Preset
[ Windows ]

⚠ Preset does not match target Windows x64

Preserve severity:

error   → error UI
warning → warning UI

Card-level summaries can remain as secondary information.

11. Explicit destination routing

In the full editor, adding a deployment must not silently choose the first output.

Instead:

Add deployment

Output
[ Choose output… ]

Settings
...

[ Add ]

Output options come from planner outputs.

If there are none:

No compatible output is currently available.

[ Create compatible build ]

Do not implement compatibility matching in Vue.

12. Planner refresh correctness

Planner requests are debounced, but asynchronous responses must not race.

Use a request generation/version:

let planGeneration = 0;

const refreshPlan = async () => {
  const generation = ++planGeneration;

  const result = await ...

  if (generation !== planGeneration)
    return;

  plan.value = result;
}

Only the newest planner response may update UI state.

13. Autosave correctness

Do not allow overlapping saves to persist stale configuration.

Serialize saves.

Conceptually:

edit
→ debounce
→ save snapshot A

more edits while A saves
→ mark dirty

A completes
→ save latest snapshot B

Desired states:

Saving…
Saved
Error

Saved must mean the latest local state has actually been persisted.

14. Preserve architecture

Do not change the architectural ownership established in Phases 1–2.

Keep:

ReleaseConfig
→ planner
→ compiler
→ workflow
→ runtime

Do not add routing or compatibility logic to Vue.

Do not add provider-specific IDs to generic UI code.

Do not infer artifact semantics from files.

Do not make automatic producers configurable.

Tests
Wizard

Test:

wizard contains Details / Source / Destinations / Review

Test:

catalog producers never appear in creation wizard

Test multiple destination selection.

Test:

Construct + Steam + Poki

can be created without creating any Build Profile.

Assert:

config.builds.length === 0
Unconfigured routing

Test an enabled destination with no input.

Planner must return:

release.destination.input.required

It must not crash.

Compiler must refuse the invalid plan.

Existing compatible source

Test:

Web Source
→ Poki

Planner should expose Source as the compatible output without introducing a build.

Missing build

Test:

Web Source
→ Steam

Planner/editor should report that no compatible output has been configured.

No Electron/Tauri profile is created automatically.

Build creation

Test Create compatible build opens Add Build.

Test user can choose:

Desktop
Electron
Windows

and explicitly confirm.

Generic fields

Test generic select fields consume inspection-provided fieldOptions.

No UI test should reference Construct provider IDs.

Diagnostics

Test a planner issue targeting:

destinations.0.slots.0.input

appears next to that output control.

Test error/warning severities remain distinct.

Async state

Test stale planner responses cannot replace newer plans.

Test overlapping autosaves cannot mark stale state as Saved.

Acceptance scenario

Starting from:

New Release

the user does:

1. Details
   Production

2. Source
   Construct
   game.c3p

3. Destinations
   ✓ Steam
   ✓ Poki

4. Review
   Create release

No producer selection appears.

No Build Profile is silently created.

The Release editor opens:

Source
Construct ✓

Builds
No builds configured

Deploy

Poki
✓ Source → Poki

Steam
⚠ Compatible build required
[ Create compatible build ]

User clicks:

Create compatible build

and explicitly chooses:

Desktop
Electron
Windows x64

After confirmation:

Construct
├─ Poki
└─ Desktop / Electron / Windows
   └─ Steam

## Implementation checklist

- [x] Remove Build & Deploy from the creation wizard.
- [x] Replace wizard step 3 with catalog-driven Destinations.
- [x] Create destinations without inventing an output route.
- [x] Allow enabled destination slots to remain unrouted and report a planner issue.
- [x] Add the complete Release editor flow for compatible-build creation.
- [ ] Add precise field-level planner issue rendering.
- [x] Complete explicit deployment routing and “Create compatible build” handling.
- [x] Guard planner responses against stale asynchronous updates.
- [x] Serialize autosaves and report the latest persisted state.
- [x] Keep planner/compiler/runtime ownership and provider-neutral shared UI boundaries.

That is the target Phase 3 UX.
