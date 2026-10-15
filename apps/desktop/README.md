# @pipelab/app (Desktop)

The Desktop version of Pipelab, built with Electron.

## 🔄 Lifecycle & Orchestration

The Desktop application serves as the native shell for the Pipelab ecosystem. Its responsibilities include:

1.  **Process Management**: The main process starts and manages the `@pipelab/cli` server as a sidecar on a per-launch loopback port. It verifies the child process, launch session, protocol, and CLI version before loading the UI.
2.  **Native Bridge**: Provides IPC handlers for native OS features (file system dialogs, system notifications, auto-updates) that are not available to the web renderer.
3.  **UI Container**: Loads and displays the `@pipelab/ui` interface.

### Communication Flow

- **Main to UI**: Via standard Electron IPC.
- **UI to CLI**: Via WebSockets (even when running inside the desktop app). The desktop server port is selected by the OS for each launch; Desktop does not adopt an already-running process on a known port.

## 🛠️ Development

### Setup

Ensure you have the root-level `.env` file configured.

### Commands

```bash
pnpm dev        # Starts the Electron app and Vite UI in development mode
pnpm package    # Packages the application for the current platform (production)
pnpm make       # Creates installers (dmg, exe, deb, zip)
```

The Desktop development renderer keeps Vite HMR. Restart the Desktop app after
changing CLI server source so the new process can complete its authenticated
startup handshake.
