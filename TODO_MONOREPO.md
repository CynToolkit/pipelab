# Pipelab Monorepo Migration - Roadmap & TODO

The project has undergone a major architectural shift: splitting the monolithic Electron app into a standalone UI package (`@pipelab/ui`), a headless Node.js logic package (`@pipelab/core-node`), and a thin Electron shell (`@pipelab/app`).

---

## 🟢 Phase 1: Stabilization (CURRENT PRIORITY)

Goal: Ensure the application remains 100% functional in both development and production environments.

### 1. Dev Workflow Verification

- [ ] Run `pnpm dev` from the root.
- [ ] Verify UI server starts on `http://localhost:5173`.
- [ ] Verify Electron window opens and successfully loads the UI.
- [ ] Verify "Core" connection: Create a new pipeline and save it (should go through CLI server via WebSocket).
- [ ] Verify "Shell" connection: Use "Choose a new path" in settings/project creation (should trigger Electron's native dialog via IPC).

### 2. Production Build Verification

- [ ] Run `pnpm turbo build`.
- [ ] Run `pnpm --filter @pipelab/app package` (Electron Forge).
- [ ] Verify that the `prePackage` hook correctly builds CLI binaries in `apps/cli/bin`.
- [ ] Verify that CLI binaries are copied into the Electron `out/` resource folder.
- [ ] Install/Run the packaged app and verify it can spawn the embedded CLI server.

### 3. Critical Fixes

- [ ] **Type Safety**: Resolve the 8 remaining type errors in `apps/ui` reported during `turbo typecheck` (mostly related to PrimeVue components and optional refs).
- [ ] **External Deps**: Audit `apps/desktop/vite.base.config.mts`'s `external` list. Ensure no `@pipelab/*` packages are accidentally externalized in the bundle.
- [ ] **IPC Routing**: Ensure `dialog:showOpenDialog` and `dialog:showSaveDialog` are correctly routed to Electron even when the UI is loaded from a remote URL.

---

## 🟡 Phase 2: Monorepo Excellence

Goal: Improve build speed, enforce boundaries, and standardize the developer experience.

### 1. Centralized Configuration

- [ ] Create `packages/tsconfig` to store base `tsconfig.json` configurations.
- [ ] Create `packages/eslint-config` to share linting rules between UI and Node packages.
- [ ] Update all `package.json` files to use these shared configs.

### 2. TS Project References

- [ ] Enable `composite: true` in all packages.
- [ ] Add `references` arrays to `tsconfig.json` files to reflect the actual dependency graph.
- [ ] Switch to `tsc --build` for lightning-fast incremental typechecking.


### 4. Quality Gates

- [ ] Implement `syncpack` to keep dependency versions identical across all packages.
- [ ] Set up a GitHub Actions workflow to run `turbo build lint typecheck test` on every PR.
- [ ] Ensure `pnpm run typecheck` passes with 0 errors at the root level.

---

## 🔵 Phase 3: Architecture & Communication

Goal: Modernize internal communication between UI, Core-Node, and Shell.

### 1. RPC Migration

- [ ] Investigate replacing manual WebSocket/IPC message serialization with [tRPC](https://trpc.io/).
- [ ] Define shared tRPC routers in `@pipelab/shared`.
- [ ] Implement tRPC server in `@pipelab/core-node`.
- [ ] Update `@pipelab/ui` to consume tRPC hooks/composables instead of raw WebSockets.

### 2. CLI Authentication & Backend-First Auth [IN PROGRESS]

- [ ] Implement `pipelab login` command for interactive CLI authentication.
- [ ] Implement `pipelab login --token <PAT>` command for headless/CI environments.
- [ ] Implement database schema/API for generating and validating long-lived Personal Access Tokens (PATs).

### 3. Benefits Management Centralization

- [ ] Move benefits mapping (IDs to names) and entitlement logic to `@pipelab/core-node`.
- [ ] Implement `BenefitsManager` in the backend to calculate user entitlements based on Supabase subscriptions.
- [ ] Implement persistent dev overrides in the backend (stored in a JSON file instead of `localStorage`).
- [ ] Define IPC channels (`benefits:get`, `benefits:setOverride`) for UI interaction.
- [ ] Update UI (`useAuth` store) to react to `benefits:updated` WebSocket events from the backend.
