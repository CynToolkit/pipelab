# Implementation Plan: Breaking Cyclic Workspace Dependencies

## Objective

Fix the cyclic workspace dependencies existing between `@pipelab/core-node`, `@pipelab/shared`, and plugin packages (specifically `@pipelab/plugin-construct`, `@pipelab/plugin-netlify`, and `@pipelab/plugin-itch`).

## Background & Motivation

Currently, Turborepo and the package manager flag cyclic dependencies which can cause issues with build order, typing, and tree-shaking. The cycles were identified as follows:

1. **Cycle 1 (Plugins vs Core-Node):**
   - `@pipelab/core-node` depends on `@pipelab/shared`.
   - `@pipelab/shared` dynamically imports all plugins (e.g., `@pipelab/plugin-construct`) in `src/plugins.ts`.
   - `@pipelab/plugin-construct` (and others like `netlify` and `itch`) imports utility functions like `zipFolder`, `extractZip`, and `ensure` from `@pipelab/core-node`.

2. **Cycle 2 (Shared vs Core-Node):**
   - `@pipelab/core-node` depends on `@pipelab/shared`.
   - `@pipelab/shared` dynamically imports from `@pipelab/core-node` in `src/quickjs.ts` (for `assetsPath`) and `src/logger.ts` (for `usePluginAPI`).

## Proposed Solution

We will break the cycles using standard Inversion of Control (IoC) patterns and proper package separation.

### Phase 1: Break Plugin -> Core-Node Cycle

- **Action**: Move Node.js filesystem and archive utilities (`zipFolder`, `extractZip`, `extractTarGz`, `ensure`, `generateTempFolder`) from `@pipelab/core-node` to `@pipelab/plugin-core`.
- **Reasoning**: `plugin-core` is the base dependency for all plugins. By moving these shared utilities to `plugin-core`, plugins can consume them without depending on the execution engine (`core-node`).
- **Dependencies**: Move required NPM dependencies (e.g., `archiver`, `tar`, `yauzl`) from `core-node` to `plugin-core`.
- **Cleanup**: Remove `@pipelab/core-node` from the `dependencies` in `packages/plugin-construct/package.json`, `packages/plugin-netlify/package.json`, and `packages/plugin-itch/package.json`.

### Phase 2: Break Shared -> Plugin Cycle

- **Action**: Refactor `builtInPlugins` out of `@pipelab/shared/src/plugins.ts`.
- **Reasoning**: `shared` is a generic library and should not statically know about all implementations of plugins.
- **Implementation**: Move the static list of plugin imports into `@pipelab/core-node/src/plugins-registry.ts` (or `apps/cli` and `apps/desktop` entrypoints). `@pipelab/shared` will continue to export `usePlugins()` to hold the reactive state, but the actual hydration will happen from `core-node`.
- **Cleanup**: Remove all `@pipelab/plugin-*` packages from the `dependencies` of `packages/shared/package.json`.

### Phase 3: Break Shared -> Core-Node Cycle

- **Action**: Remove dynamic imports of `@pipelab/core-node` from `@pipelab/shared`.
- **Implementation**:
  - In `quickjs.ts`: Replace the dynamic import of `assetsPath` with an environment variable lookup (e.g., `process.env.PIPELAB_ASSETS_PATH`) or a global configuration injected by `core-node` at startup.
  - In `logger.ts`: Remove the dynamic import of `usePluginAPI`. Instead, allow `core-node` to register a custom transport/callback into the logger module during app initialization.

## Verification & Testing

- Run `pnpm install` and ensure no cyclic dependency warnings are logged by the package manager.
- Run `turbo build` or `pnpm build` to verify the build order succeeds.
- Verify `apps/ui` works and correctly displays plugins, meaning the UI reactive state injection still works.
- Execute unit tests `pnpm test:unit` to guarantee that utilities and plugins behave as expected.
