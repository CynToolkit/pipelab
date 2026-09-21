# Implementation Plan: Generic Release Architecture

## Overview

Replace the hardcoded V1/V2 release model with a V3 descriptor-based release domain whose providers are contributed by the existing plugin registry. The workflow runtime will carry self-described artifacts and the compiler will resolve source, producer, and destination providers without integration-specific branches.

## Architecture Decisions

- Release contracts live under `packages/shared/src/release/` and are exported from `@pipelab/shared`.
- Plugin release contributions extend `MainPluginDefinition` and `RendererPluginDefinition`; no second registry is introduced.
- Artifact compatibility is structural and centralized in `matchesArtifact`.
- Workflow runtime owns only workflow/artifact execution mechanics, not release catalogues or producer IDs.
- The V3 config is the only supported release configuration; old V1/V2 migration and compatibility code is removed as consumers move.

## Task List

### Phase 1: Foundation

- [ ] Define V3 release contracts, validation issues, constraints, matcher, and catalog types.
- [ ] Extend plugin definitions with release contributions and add catalog construction from the existing registry.
- [ ] Add architecture tests for descriptor matching, fake plugin extensibility, and V3-only config shape.

### Checkpoint: Foundation

- [ ] Shared package typecheck and focused release tests pass.

### Phase 2: Runtime and compiler

- [ ] Replace workflow runtime artifact lookup with declared artifact descriptors and generic references.
- [ ] Rewrite the workflow compiler around provider resolution and explicit producer/output slot references.
- [ ] Generate standalone workflow task IDs from loaded plugin node definitions.

### Checkpoint: Runtime

- [ ] Workflow runtime tests prove `setArtifact` uses step declarations without a global registry.
- [ ] Fake source/producer/destination compiler test passes without known integration IDs.

### Phase 3: Providers and integrations

- [ ] Create `plugins/plugin-godot` and move Godot source/producer inspection and export behavior there.
- [ ] Convert Construct to a source provider and add the generic folder source.
- [ ] Convert Electron and Tauri to producers.
- [ ] Convert Steam, Itch, Poki, filesystem, ZIP, and Cloud to destination providers.

### Phase 4: IPC, validation, and UI

- [ ] Replace integration-specific inspection IPC with generic release catalog/inspect/validate APIs.
- [ ] Move readiness and validation into provider contracts.
- [ ] Make Release Flow catalogue-driven and remove hardcoded source/target/service options.

### Phase 5: Cleanup and proof

- [ ] Delete V1/V2 types, migrations, legacy definitions, and hardcoded release branches.
- [ ] Run architecture tests, full workflow tests, typecheck, lint, and build.
- [ ] Verify adding a fake engine or destination requires no generic-core changes.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Shared and workflow-runtime currently depend on each other | High | Keep release contracts type-only at runtime boundaries and remove runtime catalogue imports first. |
| UI and persisted config consumers are tightly coupled to V2 | High | Move contract-first, then update IPC and UI in separate slices. |
| Existing plugin runners are not all workflow-safe | Medium | Use `createWorkflowActionTask` and preserve explicit tasks only for non-node mechanics during migration. |
| Large deletion can hide regressions | High | Commit each slice, run focused tests after each, then perform architecture search gates. |

## Open Questions

- None required to begin the contract and runtime slices.
