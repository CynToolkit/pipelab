# Pipelab - AI Context

Pipelab is a visual automation tool designed to create task automation workflows and cross-platform desktop applications. It provides a visual interface for building pipelines that can automate repetitive tasks, deploy to various platforms (Steam, Itch.io, etc.), and more.

## Architecture Overview

The project is an Electron-based application built with Vue 3 and TypeScript, organized as a Turbo monorepo.

- **Desktop App (`apps/desktop/`)**: Manages the Electron lifecycle, IPC handlers, a WebSocket server for real-time communication, and handles headless pipeline execution.
- **UI Application (`apps/ui/`)**: A Vue 3 application using PrimeVue for UI components. It communicates with the desktop main process via IPC and WebSockets.
- **CLI App (`apps/cli/`)**: A command-line interface for Pipelab.
- **Packages (`packages/`)**: Contains shared logic, constants, plugins (Steam, Itch, etc.), and the core node system.
- **Core Engine (`packages/core-node/` & `@pipelab/plugin-core`)**: Leverages `@pipelab/core` and QuickJS (via WebAssembly) for executing automation logic.

## Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [Vue 3](https://vuejs.org/) (Composition API)
- **UI Library**: [PrimeVue v4](https://primevue.org/) with Tailwind/PrimeFlex
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **Build Tool**: [Vite](https://vitejs.dev/) with [Electron Forge](https://www.electronforge.io/) and [Turborepo](https://turbo.build/)
- **Database/Backend**: [Supabase](https://supabase.com/)
- **Testing**: [Vitest](https://vitest.dev/) (Unit), [Playwright](https://playwright.dev/) (E2E)
- **Linting & Formatting**: [oxlint](https://oxc-project.github.io/docs/guide/usage/linter.html) & [oxfmt](https://oxc-project.github.io/docs/guide/usage/formatter.html)
- **Analytics/Monitoring**: [PostHog](https://posthog.com/), [Sentry](https://sentry.io/)

## Key Directories

- `apps/desktop/`: Electron main process logic, IPC handlers, and API.
- `apps/ui/`: Vue application source code (components, pages, store, etc.).
- `apps/cli/`: CLI entrypoints and commands.
- `packages/`: Shared workspace packages (constants, migration code, and plugins).
- `scripts/`: Maintenance and migration scripts.
- `tests/`: End-to-end and unit tests.

## Building and Running

The project uses `pnpm` as its package manager and Turborepo for task orchestration.

| Task              | Command                                     |
| :---------------- | :------------------------------------------ |
| **Development**   | `turbo dev` or `pnpm dev`                   |
| **Build (All)**   | `turbo build` or `pnpm build`               |
| **Package**       | `turbo package` or `pnpm package`           |
| **Unit Tests**    | `turbo test` or `pnpm test:unit`            |
| **Linting**       | `turbo lint` or `pnpm lint` (runs `oxlint`) |
| **Type Checking** | `turbo typecheck` or `pnpm typecheck`       |
| **Format**        | `pnpm format` (runs `oxfmt .`)              |

## Development Conventions

- **Typing**: Strict TypeScript usage across the codebase.
- **Components**: Functional and modular Vue components. PrimeVue is used for most UI elements.
- **State**: Persistent state management using Pinia with `pinia-plugin-persistedstate`.
- **Communication**: Use the defined IPC handlers and the WebSocket manager for renderer-to-main or external communication.
- **Versioning**: Uses [Changesets](https://github.com/changesets/changesets) for managing versions and changelogs.
- **Code Style**: Enforced by `oxlint` and `oxfmt`. Run `pnpm format` to auto-format.

## Common Workflows

- **Adding a new Node/Block**: Investigate `plugins/plugin-core` or related plugins and how nodes are registered in the core engine.
- `plugins/`: Contains all Pipelab plugins.
- `assets/`: Contains all Pipelab assets.
- **Modifying the UI**: Most views are located in `apps/ui/src/pages/` or `apps/ui/src/components/`.
- **Database Changes**: Update Supabase types after modifying the remote schema.
- **Releases**:
  1. `pnpm changeset` to document changes.
  2. `pnpm changeset version` to bump versions.
  3. `pnpm changeset tag` to tag the release.

# General recommendations

- When modifying code, do not attempt to typecheck it.
- When modifying code, do not attempt to lint it.
- When creating packages, ensure files are **not** accessed via subpaths (e.g. `import { useAPI } from "@pipelab/shared/api"`).
- Do not read docs from packages irectly, use context7 mcp
- Prefer your native file read tools over cat command
- Do not grep unless strictly necessary
- Use pnpm instead of npm
