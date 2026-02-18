# Pipelab - AI Context

Pipelab is a visual automation tool designed to create task automation workflows and cross-platform desktop applications. It provides a visual interface for building pipelines that can automate repetitive tasks, deploy to various platforms (Steam, Itch.io, etc.), and more.

## Architecture Overview

The project is an Electron-based application built with Vue 3 and TypeScript.

- **Main Process (`src/main.ts`)**: Manages the Electron lifecycle, IPC handlers, a WebSocket server for real-time communication, and handles headless pipeline execution via command-line arguments.
- **Renderer Process (`src/renderer/`)**: A Vue 3 application using PrimeVue for UI components. It communicates with the main process via IPC and WebSockets.
- **Shared (`src/shared/`)**: Contains models, types, and utilities shared between the main and renderer processes.
- **Core Engine**: Leverages `@pipelab/core` and QuickJS (via WebAssembly) for executing automation logic.

## Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [Vue 3](https://vuejs.org/) (Composition API)
- **UI Library**: [PrimeVue v4](https://primevue.org/) with Tailwind/PrimeFlex
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **Build Tool**: [Vite](https://vitejs.dev/) with [Electron Forge](https://www.electronforge.io/)
- **Database/Backend**: [Supabase](https://supabase.com/)
- **Testing**: [Vitest](https://vitest.dev/) (Unit), [Playwright](https://playwright.dev/) (E2E)
- **Analytics/Monitoring**: [PostHog](https://posthog.com/), [Sentry](https://sentry.io/)

## Key Directories

- `src/main/`: Electron main process logic, IPC handlers, and API.
- `src/renderer/`: Vue application source code (components, pages, store, etc.).
- `src/shared/`: Shared types, constants, and utilities.
- `assets/`: Static assets and build-related resources (icons, entitlements).
- `scripts/`: Maintenance and migration scripts.
- `tests/`: Unit and E2E tests.

## Building and Running

The project uses `pnpm` as its package manager.

| Task | Command |
| :--- | :--- |
| **Development** | `pnpm dev` (starts Electron with source maps enabled) |
| **Build (All)** | `pnpm build` |
| **Build (Linux)** | `pnpm build:linux` |
| **Build (Windows)** | `pnpm build:win` |
| **Build (Mac)** | `pnpm build:mac` |
| **Package** | `pnpm package` |
| **Unit Tests** | `pnpm test:unit` |
| **E2E Tests** | `pnpm test:e2e:local` |
| **Linting** | `pnpm lint` |
| **Type Checking**| `pnpm typecheck` |

## Development Conventions

- **Typing**: Strict TypeScript usage across the codebase.
- **Components**: Functional and modular Vue components. PrimeVue is used for most UI elements.
- **State**: Persistent state management using Pinia with `pinia-plugin-persistedstate`.
- **Communication**: Use the defined IPC handlers (`src/main/handlers.ts`) and the WebSocket manager for renderer-to-main or external communication.
- **Versioning**: Uses [Changesets](https://github.com/changesets/changesets) for managing versions and changelogs.
- **Code Style**: Enforced by ESLint and Prettier. Run `pnpm format` to auto-format.

## Common Workflows

- **Adding a new Node/Block**: Investigate `src/shared/model.ts` and how nodes are registered in the core engine.
- **Modifying the UI**: Most views are located in `src/renderer/pages/` or `src/renderer/components/`.
- **Database Changes**: Update Supabase types using `pnpm supa:types` after modifying the remote schema.
- **Releases**:
  1. `pnpm changeset` to document changes.
  2. `pnpm changeset version` to bump versions.
  3. `pnpm changeset tag` to tag the release.


# General recomandations
- When modifying code, do not attempt to typecheck it.
- When modifying code, do not attempt to lint it.
