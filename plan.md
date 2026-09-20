# Add Build Profiles and Release Planner on Top of PR #90

Work from the current PR #90 architecture. Do not redesign the compiler, runtime, or UI in this task.

## Goal

Replace the user-facing concept of raw producers with a semantic Build Profile model while keeping the existing producer/artifact DAG internally.

```text
Source
  → Build Profiles
  → Destinations
```

Internally:

```text
Source → Producer → Artifact → Producer → Artifact → Destination
```

This task covers shared models, planning logic, and tests.

## 1. Change `ReleaseConfig`

Replace persisted raw `producers` with `builds`.

```ts
interface ReleaseConfig {
  version: "3.0.0";

  id: string;
  project: string;
  name: string;
  description?: string;

  source: ReleaseSourceConfig;
  builds: ReleaseBuildProfileConfig[];
  destinations: ReleaseDestinationConfig[];

  continueOnError?: boolean;
}
```

PR #90 V3 is not released yet, so make this a straight cut. Do not add migrations.

## 2. Add Build Profile Types

```ts
interface ReleaseBuildProfileConfig {
  id: string;
  type: string; // desktop, web, mobile, console, etc.
  engine: string; // ReleaseProducerDefinition.id
  enabled: boolean;
  input?: ReleaseOutputRef;
  config: Record<string, unknown>;
  targets: ReleaseBuildTargetConfig[];
  name?: string;
}

interface ReleaseBuildTargetConfig {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
```

Multiple profiles with the same `type` and/or `engine` are valid:

```text
Desktop / Electron
Desktop / Tauri
Desktop / Electron
```

They are separate profile instances.

## 3. Add User-Facing Output References

Do not expose the internal producer `ArtifactRef` in `ReleaseConfig`.

```ts
type ReleaseOutputRef =
  | { source: true }
  | {
      buildId: string;
      targetId: string;
    };
```

Destination slots should use `ReleaseOutputRef`. The planner lowers these to the existing internal `ArtifactRef`.

## 4. Add Build-Type Metadata

```ts
interface ReleaseBuildTypeDefinition {
  id: string;
  label: string;
  description?: string;
  icon?: IconType;
}
```

Provide built-in definitions for:

- `desktop`
- `web`
- `mobile`
- `console`

These are presentation and planning metadata only. Do not add compiler branches such as `if (build.type === "desktop")`.

## 5. Extend Producer Target Definitions

```ts
interface ReleaseProducerTargetDefinition {
  // Existing fields...
  buildType?: string;
}
```

A producer may expose targets belonging to multiple build types.

Example:

```text
Godot:
  windows-x64 → desktop
  linux-x64   → desktop
  macos-arm64 → desktop
  web         → web
```

Do not change current plugins in this task unless needed in test fixtures.

## 6. Distinguish Build Engines from Automatic Transforms

```ts
interface ReleaseProducerPlanning {
  mode: "build" | "automatic";
}

interface ReleaseProducerDefinition {
  // Existing fields...
  planning: ReleaseProducerPlanning;
}
```

Meaning:

- `build`: selected explicitly as a Build Profile engine.
- `automatic`: the planner may insert it as invisible plumbing.

The planner must never automatically choose a `build` producer.

## 7. Add Dynamic Artifact Acceptance

Keep the declarative:

```ts
accepts: ArtifactConstraint;
```

Add:

```ts
type ArtifactAcceptance =
  | { accepted: true }
  | {
      accepted: false;
      reason?: string;
    };
```

Support:

```ts
acceptsWhen?(
  artifact: ArtifactDescriptor,
  context: ReleaseAcceptanceContext,
): ArtifactAcceptance;
```

Add `acceptsWhen` to both `ReleaseProducerDefinition` and `ReleaseDestinationDefinition`.

Compatibility means:

```text
matchesArtifact(artifact, accepts)
AND acceptsWhen does not reject
```

Create one shared helper for the planner, validation, and compiler. Do not serialize executable predicates into `ReleaseCatalog`.

## 8. Implement the Release Planner

Add:

```text
packages/shared/src/release/planner.ts
```

Conceptually:

```ts
planRelease(
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleasePlanningContext,
): ReleasePlan;
```

The planner must:

1. Resolve the selected source descriptor.
2. Resolve every enabled Build Profile to its selected producer engine.
3. Validate that enabled targets belong to the Build Profile's `type`.
4. Resolve Build Profile inputs.
5. Insert only producers where `planning.mode === "automatic"` when needed.
6. Produce resolved internal producer configurations.
7. Resolve every Build Profile target to an artifact descriptor.
8. Resolve destination `ReleaseOutputRef` values.
9. Evaluate destination compatibility using static and dynamic acceptance.
10. Detect cycles.
11. Return user-facing validation issues instead of throwing for normal invalid configuration.

## 9. Input Resolution Rules

Candidate inputs are:

```text
source output
+
outputs from other enabled Build Profiles
```

For each candidate:

```text
candidate
  → direct engine acceptance
  OR
  → zero or more automatic transforms
  → engine acceptance
```

Rules:

- An explicit `build.input` resolves only that requested semantic input.
- With no input selected and exactly one compatible semantic upstream output, select it.
- Multiple distinct compatible outputs produce an ambiguity issue.
- Never silently select between multiple semantic upstream Build Profile outputs.
- Automatic transform chains may be resolved automatically.
- Never infer meaning from filesystem contents.

## 10. Automatic Transform Search

Only producers with:

```ts
planning.mode === "automatic";
```

may be inserted.

Example:

```text
application/web/archive(zip)
  → Unzip
  → application/web/directory
  → Electron
```

The search must be bounded, deterministic, cycle-safe, descriptor-driven, and based on declared `output`/`transform` metadata. It must preserve strict descriptor semantics.

Do not add a generic heuristic or semantic detector system.

## 11. Planner Output

Conceptually:

```ts
interface ReleasePlan {
  producers: ReleaseProducerConfig[];
  outputs: PlannedReleaseOutput[];
  destinations: ResolvedReleaseDestinationConfig[];
  issues: ValidationIssue[];
  graph: ReleasePlanGraph;
}
```

Adjust details as needed while preserving these concepts.

`PlannedReleaseOutput` should expose:

- source/build identity;
- target identity;
- descriptor;
- internal artifact reference.

The graph must be renderer-safe data, not executable objects.

## 12. Preserve Internal `ArtifactRef`

Do not delete:

```ts
type ArtifactRef =
  | { source: true }
  | { producerId: string; outputId: string };
```

It remains useful for planner output, the compiler, and the runtime graph.

```text
ReleaseOutputRef → persisted/user-facing
ArtifactRef      → resolved/internal
```

## 13. Validation Paths

Planner issues must refer to the user model:

```text
builds.0.engine
builds.0.input
builds.0.targets.1
destinations.0.slots.0.input
```

Do not surface generated producer IDs in normal errors.

## 14. Required Tests

Add focused unit tests for:

- **Basic Build Profile:** Web source → Desktop / Electron / Windows resolves to one internal producer.
- **Multiple profiles of the same type:** Desktop / Electron and Desktop / Tauri coexist.
- **Multiple profiles using the same engine:** Two Electron profiles remain separate.
- **Build-type validation:** A `desktop` profile cannot enable a target declared only as `web`.
- **Automatic transform:** Web ZIP → automatic Unzip → Electron resolves without an explicit Unzip profile.
- **Direct compatibility:** No automatic transform is inserted when the engine directly accepts the source.
- **Ambiguous input:** Multiple compatible upstream outputs require explicit `input`.
- **Cycles:** Reject Build A → Build B → Build A.
- **Missing engine:** An unavailable engine is invalid and is not silently replaced.
- **Dynamic producer acceptance:** `acceptsWhen` can reject a statically compatible artifact.
- **Dynamic destination acceptance:** `acceptsWhen` preserves its rejection reason.
- **Destination references:** `{ buildId, targetId }` resolves to the correct internal artifact.

## 15. Explicit Non-Goals

Do not:

- redesign `release-flow.vue`;
- modify the wizard UX;
- build the Build Profile UI;
- fix connection dialogs;
- implement autosave/readiness UI;
- change workflow runtime;
- remove the existing compiler DAG;
- add Electron/Tauri-specific planner branches;
- add Steam-specific planner logic;
- implement mobile/console plugins;
- add semantic filesystem inspection;
- automatically choose between Electron and Tauri;
- create a graph editor.

## 16. Architectural Invariant

> Build Profiles are the user model. Producers are the execution model.

> Pipelab may compose declared artifact metadata, but must never infer semantic meaning from file contents.

## 17. Completion Criteria

This phase is complete when:

- `ReleaseConfig` uses `builds`;
- user-facing references use `ReleaseOutputRef`;
- producer targets support `buildType`;
- producers distinguish `build` vs. `automatic`;
- static and dynamic artifact acceptance share one implementation;
- `planRelease()` resolves Build Profiles into the existing internal producer graph;
- automatic transforms work;
- ambiguity, cycles, and missing engines are reported cleanly;
- planner output is deterministic;
- comprehensive planner tests pass;
- existing compiler/runtime behavior has not been redesigned.
