# @pipelab/cli (The Engine)

The standalone engine of Pipelab. It provides the core automation logic and serves as the backend for the visual editor.

## ⚙️ Core Roles

1.  **WebSocket Server**: When started with `serve`, it acts as a backend for the `@pipelab/ui`. It handles graph execution, real-time logging, and state synchronization.
2.  **Headless runner**: When started with `run <file>`, it can execute a Pipelab pipeline (.json) directly from the terminal without any UI.
3.  **Plugin Host**: Manages the execution context for all Pipelab plugins, including the QuickJS-based virtual environment.

## 🛠️ Development

### Setup
The CLI requires Supabase variables to be "baked in" during the build process. Ensure your root `.env` is populated before building or running `pnpm dev`.

### Commands
```bash
pnpm dev        # Start the server in development mode
pnpm build      # Generate the production CJS bundle
pnpm pkg        # Create a standalone executable in the /bin folder
```
