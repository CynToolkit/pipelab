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

### Integration sign-in

```bash
pipelab settings integrations steam login
pipelab settings integrations poki login
```

Steam asks for the account username, then runs SteamCMD in the current terminal so you can enter the password and Steam Guard code. Poki prints a sign-in link and saves the returned token for Pipelab. If the server has no browser, open the link elsewhere, then paste the final browser URL into the waiting command. Neither command uploads a build. Both accept `--user-data <path>` to use a custom Pipelab data directory.
