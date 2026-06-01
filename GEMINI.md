# Pipelab - AI Context

## Architecture
- **Desktop (`apps/desktop/`)**: Electron main process, IPC, WebSocket server, and headless execution.
- **UI (`apps/ui/`)**: Vue 3 (Composition API) & PrimeVue v4. Communicates via IPC & WebSockets.
- **CLI (`apps/cli/`)**: CLI entrypoints and commands.
- **Packages (`packages/`)**: Shared utilities, constants, migrations, and plugins.
- **Core Engine (`packages/core-node/` & `@pipelab/plugin-core`)**: Executed using QuickJS (via WebAssembly).

## Tech Stack & CLI Tasks
Uses `pnpm` and Turborepo.
- **Dev**: `pnpm dev`
- **Build**: `pnpm build`
- **Typecheck**: `pnpm typecheck`
- **Format**: `pnpm format` (runs `oxfmt .`)
- **Lint**: `pnpm lint` (runs `oxlint`)

## Core Workflows
- **Nodes/Blocks**: Register and define nodes inside `plugins/`.
- **UI Views**: Located in `apps/ui/src/pages/` and `apps/ui/src/components/`.
- **Database**: Remote schema is powered by Supabase. Update Supabase types after remote schema modifications.
- **Releases**: Managed via Changesets (`pnpm changeset` -> `pnpm changeset version` -> `pnpm changeset tag`).

## Development Rules & Conventions

### Typing & Code Quality
- **Never use `as any`**: Do not use `as any` or `as XXX` or `as unknown` or loose `any` casts. Always use strict, proper TypeScript types or safe conversions.
- **No typecheck/lint on modify**: Do not attempt to run typecheck or lint commands during modification.
- **Packages**: Never import workspace packages via subpaths (e.g. `import { useAPI } from "@pipelab/shared/api"` is forbidden; use package exports).

### Workspace Operations
- Do not read docs from packages directly; use context7 mcp.
- Prefer native file read tools over `cat` command.
- Do not grep unless strictly necessary. Never grep in gitignored directories. Use `rg` instead of `grep`.
- Think twice before proposing a solution/plan to identify evident flaws or simpler alternatives.
