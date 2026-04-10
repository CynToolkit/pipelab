# @pipelab/app (Desktop)

The Desktop version of Pipelab, built with Electron.

## 🔄 Lifecycle & Orchestration

The Desktop application serves as the native shell for the Pipelab ecosystem. Its responsibilities include:

1.  **Process Management**: In production, the main process is responsible for spawning and managing the `@pipelab/cli` server as a "sidecar" process.
2.  **Native Bridge**: Provides IPC handlers for native OS features (file system dialogs, system notifications, auto-updates) that are not available to the web renderer.
3.  **UI Container**: Loads and displays the `@pipelab/ui` interface.

### Communication Flow
- **Main to UI**: Via standard Electron IPC.
- **UI to CLI**: Via WebSockets (even when running inside the desktop app).

## 🛠️ Development

### Setup
Ensure you have the root-level `.env` file configured.

### Commands
```bash
pnpm dev        # Starts the Electron app in development mode
pnpm package    # Packages the application for the current platform (production)
pnpm make       # Creates installers (dmg, exe, deb, zip)
```