---
name: tailscale-preview
description: Serve the Pipelab UI and CLI dev servers for remote browser access over Tailscale.
---

# Tailscale Preview

Serve the standalone UI and CLI over Tailscale. This procedure applies to
the current `dev:remote` scripts in `apps/ui` and `apps/cli`.

Run the Pipelab UI + CLI dev servers so a remote browser (e.g. the developer's
laptop) can open the UI over Tailscale. Use when asked to "start the app",
"preview from tailscale", or expose a dev URL.

## Start

From the repository root, run this command and keep the terminal open:

```bash
pnpm dev-remote --filter=@pipelab/ui --filter=@pipelab/cli 2>&1 | tee /tmp/pipelab-dev-remote.log
```

The root script delegates to Turbo, which starts the UI on port `5173` and the
CLI on port `33753` with remote-safe bindings.

1. Confirm Tailscale is up: `tailscale ip -4`. Note the machine IP
   (e.g. `100.111.167.123`). The UI URL is `http://<ip>:5173`.
2. Wait for startup, then verify the same log captured by the command above:

```bash
rg 'WebSocket server listening on port 33753|\[Startup Progress\] Ready!' /tmp/pipelab-dev-remote.log
```

3. Verify the CLI process is running and not stopped:

```bash
cli_pid="$(pgrep -f 'tsx.*src/index.ts serve' | head -1)"
test -n "$cli_pid" && rg '^State:\s+[SR]' "/proc/$cli_pid/status"
```

4. Verify the backend and UI separately over the Tailscale IP. A successful
   UI request alone is not sufficient:

```bash
node -e "const WebSocket=require('./node_modules/ws'); const ws=new WebSocket('ws://<ip>:33753'); ws.on('open',()=>{console.log('WS-OK'); process.exit(0)}); ws.on('error',()=>process.exit(1))"
curl --fail -o /dev/null -w '%{http_code}\n' http://<ip>:5173/paths
```

5. Hand the user `http://<ip>:5173`. Tell them to **hard-refresh** if the
   bundle changed since their last visit.
6. The user confirming the page loads past "initializing environment" is the
   done gate. The UI stays connected via WebSocket; "initializing
   environment" stuck = the browser can't reach the CLI server.

## Gotchas (learned the hard way)

- **Keep the startup terminal running.** `dev-remote` runs in the foreground
  and stops when its terminal/session is closed.
- **Host binding and client target**: the CLI supports binding through
  `packages/core-node/src/websocket-server.ts`, but its default is deliberately
  loopback; pass `--host 0.0.0.0` for Tailscale. The UI dev client connects to
  `window.location.hostname`, not `localhost`
  (`apps/ui/src/composables/websocket-client.ts`). If remote initialization
  hangs, re-check both the CLI bind and this UI client target first.
- **Vite needs `--host 0.0.0.0`** or the dev server only listens on loopback.
- **CLI needs `--host 0.0.0.0` too**. Its application default is deliberately
  `127.0.0.1`; passing the host to the `serve` command is what exposes the
  WebSocket/API listener to Tailscale.
- Port `33753` is the CLI WebSocket/API port (`@pipelab/constants`
  `websocketPort`); UI dev port is `5173`.

## Verify

```bash
rg 'WebSocket server listening on port 33753|\[Startup Progress\] Ready!' /tmp/pipelab-dev-remote.log
curl --fail -o /dev/null -w '%{http_code}\n' "http://$(tailscale ip -4):5173/paths"
```

The expected UI response is `200`. If an old process already owns either
port, stop the old dev process before running `dev-remote` again.
