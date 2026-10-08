# @pipelab/ui (The Interface)

The main visual interface for Pipelab, built with Vue 3 and PrimeVue.

## 🎨 Role & Connectivity

The UI is a "thin client" designed to configure and run Release workflows. It does not execute logic directly; instead, it orchestrates the `@pipelab/cli` engine.

### Connection Discovery

When the UI starts, it attempts to connect to the Pipelab Engine (CLI process):

1.  **Discovery**: It looks for a running engine on the configured port (default: `33753`).
2.  **Streaming**: Once connected, it receives real-time execution logs and progress updates via WebSockets.
3.  **Authentication**: Syncs its authentication state with the engine's Supabase instance.

## 🛠️ Development

### Tech Stack

- **Framework**: Vue 3 (Composition API)
- **UI Library**: PrimeVue v4
- **State**: Pinia
- **Icons**: PrimeIcons / Lucide

### Commands

```bash
pnpm dev        # Starts the Vite development server (port 5173)
pnpm build      # Generates the production assets in the /dist folder
```

> [!NOTE]
> During development, the UI expects the `@pipelab/cli` to be running separately (via `pnpm dev` at the root).

### Hosted browser mode

Select hosted mode explicitly for a standalone browser deployment:

```bash
VITE_PIPELAB_MODE=hosted pnpm --filter @pipelab/ui build
```

The hosted build does not try to connect to an agent and keeps navigation and
browser preferences available without one. Local workflows, machine settings,
and execution still require the Desktop agent. A browser build without this
flag remains agent-capable for local and remote development; Electron always
uses Desktop mode even if the flag is present.
