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

### Browser startup without an agent

Select the hosted startup policy for a standalone browser deployment:

```bash
VITE_PIPELAB_MODE=hosted pnpm --filter @pipelab/ui build
```

The hosted startup policy skips agent discovery and keeps navigation and
browser preferences available without an agent. It only controls startup:
after secure pairing is available, the browser can attach an agent in the same
session, and agent-backed capabilities follow the live connection state.
Local workflows, machine settings, and execution require a connected agent. A
browser build without this flag attempts agent discovery on startup; Electron
always attempts startup connection even if the flag is present.
