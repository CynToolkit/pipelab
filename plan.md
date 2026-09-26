Phase 5 — Release Workflow UX
[x] 1. Restructure workflow navigation
Add top-level workflow tabs: Configuration | Builds | Artifacts | Runs.
Update WorkflowShell.vue, router routes and active-tab typing.
Configuration contains only:
Source
Destinations
global readiness/autosave
Ship
Builds is intentionally secondary configuration.
Do not add Variables yet.
Keep planner graph out of the primary UI; expose it only through an Advanced/View plan action.
[x] 2. Apply best build defaults during workflow creation
Keep wizard flow simple: Details → Source → Destinations → Review.
Do not add a Builds step.
Source selection remains explicit; do not auto-select the first source.
After Source + Destinations are known, resolve recommended builds using the existing shared release-default logic.
Use packages/shared/src/release/preferences.ts as the source of truth.
Current desktop default must remain:
engine: @pipelab/plugin-electron/producer
target: windows-x64
Do not hardcode Electron or Windows inside Vue components.
Planner must validate every automatic choice before it is accepted.
Prefer, in order:
already-compatible Source output;
already-existing compatible build output;
configured best-default build.
Reuse one compatible build/output for multiple destinations when possible.
Explicitly persist the selected destination.slots[].input.
If no compatible default exists, do not guess another engine/target. Create the workflow as a valid draft and let readiness explain what is missing.
[x] 3. Make creation-time automation the only automatic mutation
Remove the current automatic release:resolve-defaults behavior from release-flow.vue load.
Remove automaticResolutionRequested / refreshPlan(true) behavior that changes and saves a workflow just because the editor opened.
Opening Configuration, Builds, Artifacts or Runs must never:
create a build;
change an engine;
enable a target;
select another output;
reroute a destination.
After workflow creation, all persistent build/routing changes require an explicit user action.
Planner may still calculate internal automatic transformation nodes; those are not persisted user configuration.
[x] 4. Improve wizard Review without exposing build complexity
Resolve best defaults before final creation and keep the result separate from the editable wizard draft.
Protect resolution with a request/revision id so stale responses cannot overwrite newer Source/Destination choices.
Review should show a concise generated summary when relevant, for example:
Build · Electron · Windows x64
Do not show engine/target selectors on Review.
If no build is required, omit the Build row.
If automatic setup cannot satisfy a destination, show concise copy such as Additional build setup required after creation.
Handle resolve failure with visible Retry; do not silently create a different configuration.
Create release must persist exactly the configuration shown/resolved by Review.
[x] 5. Build premium Configuration page
Refactor release-flow.vue so Configuration is focused on Source + Destinations.
Source should be one compact summary row/card:
provider icon/name;
meaningful path/project summary;
quiet readiness state;
one Edit affordance.
Destination rows should show:
destination;
deployment/slot;
selected output;
blocking state if any.
Move detailed provider fields/settings into a drawer or contextual panel.
Avoid multiple permanent buttons on each row.
Missing output should expose one useful repair action, e.g. Configure build.
Clicking a build-related problem should navigate to /builds and identify the affected build/requirement.
Keep exact field errors next to the field inside the drawer.
Keep Ready states visually quiet; reserve strong visual treatment for actionable problems.
[x] 6. Create dedicated Builds page
Move build profile management out of the main Configuration surface.
Show one compact row per build with:
build type;
engine;
enabled targets;
meaningful input summary;
readiness/problem state.
Add Build remains explicit: Type → Engine → Target.
Only expose producers with planning.mode === "build".
Respect catalog target.availability; unavailable targets must be disabled and show the backend-provided reason.
Do not silently enable the first target after switching engine.
Engine changes must stage the new config and require an explicit compatible target selection.
Removing/disabling a build referenced by another build or destination must show a confirmation naming the affected consumers.
Never auto-reroute those consumers.
Create compatible build from Configuration should open Builds with planner-filtered compatible choices.
[x] 7. Add workflow-level Artifacts page
Add /workflows/:flowId/:projectId/artifacts.
Reuse build-history:get-all scoped to the current workflow/project.
Build a UI view model by flattening artifacts from run history.
Do not introduce new artifact persistence.
Sort newest first.
Show, when explicitly available:
artifact display name;
release version;
platform;
architecture;
format/kind;
size;
local/cloud availability;
run date;
originating run.
Actions:
Open for local artifacts;
Download for cloud artifacts;
View run for provenance/debugging.
Keep Artifacts inside Run Detail too; the workflow-level page is for discovery across runs.
Never infer platform/type from filename or file contents.
Add lightweight filtering only if useful: version, platform/format, local/cloud.
Include loading, empty, error and Retry states.
[x] 8. Harden async/readiness behavior
Add stale-request protection for:
Source inspection;
producer inspection;
planner refresh;
compatible-build probing;
build-input probing;
wizard best-default resolution;
Artifacts loading.
Older responses must never overwrite newer workflow state.
Planner request failure => readiness becomes unavailable and Ship is disabled.
Save failure remains visible and retryable.
A later successful save clears the old save error.
Ship must:
save the current revision;
validate/plan that revision;
execute only after successful persistence.
Backend execution still reloads authoritative persisted workflow state.
[x] 9. Add destructive-change protection
Confirm only changes that actually discard config or break references.
Cover:
Source provider change;
engine change;
build removal/disable;
destination removal;
slot removal.
Confirmation text must explain concrete impact.
Do not use generic Are you sure?.
Keep autosave.
Do not add a permanent Save button.
Do not silently “repair” references after confirmation.
[x] 10. Tests / acceptance gate
Add shared tests for best defaults:
Desktop chooses Electron + Windows x64.
Existing compatible Source output prevents unnecessary build creation.
Existing compatible build is reused.
Multiple destinations can reuse one compatible output.
Explicit destination input is never overwritten.
Incompatible/unavailable default is not forced.
Running resolver twice is idempotent.
Add UI tests:
wizard Source is not auto-selected;
Review resolves and displays best defaults;
stale wizard resolution is ignored;
resolve failure exposes Retry;
created workflow contains resolved builds + explicit routing;
opening existing workflow does not call/apply release:resolve-defaults;
engine switch does not silently select a target;
referenced-build removal warns correctly;
Artifacts aggregates correct workflow runs only.
Run focused UI tests, typecheck, lint and build.
Run shared/core tests if shared resolver/core handling changes.
QA light/dark + desktop/tablet/mobile + keyboard/focus.
Final expected behavior:
Source → Destinations → Create
Pipelab creates planner-valid best-default builds automatically.
Typical desktop workflow receives Electron + Windows x64 without asking the user.
User only opens Builds when they want to customize the default.
Reopening the workflow never changes configuration by itself.
