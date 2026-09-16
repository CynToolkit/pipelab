---
name: tailscale-preview
description: Serve the Pipelab UI and CLI dev servers for remote browser access over Tailscale.
---

# Tailscale Preview — serve the app for remote browser access

Run the Pipelab UI + CLI dev servers so a remote browser (e.g. the developer's
laptop) can open the UI over Tailscale. Use when asked to "start the app",
"preview from tailscale", or expose a dev URL.

## Start

Run this simple command from the repository root:

```bash
pnpm dev-remote --filter=@pipelab/ui --filter=@pipelab/cli
```

It starts both services with remote-safe bindings. Leave the terminal running
while using the preview.

1. Confirm Tailscale is up: `tailscale ip -4`. Note the machine IP
   (e.g. `100.111.167.123`). The UI URL is `http://<ip>:5173`.
2. Use the `pnpm dev-remote` command above. Do not add another `--` before
   the filters.
   The UI and CLI are separate servers. Opening the UI URL alone does not
   start the backend; the CLI must be running on the same machine and its
   WebSocket port (`33753`) must be reachable over Tailscale.
3. Wait ~30s. Verify in order:
   - CLI log shows `WebSocket server listening on port 33753` and
     `[Startup Progress] Ready!`: `grep -E 'listening on port|Ready!' /tmp/pipelab-cli.log`
   - CLI process is **not** in `T (stopped)` state:
     `cat /proc/$(pgrep -f 'tsx/dist/loader' | head -1)/status | grep State`
     (must read `S`, never `T`).
   - WebSocket handshake succeeds over the Tailscale IP (this is the backend
     check; a successful HTTP request to the UI is not sufficient):
     `node -e "new (require('<repo>/node_modules/ws'))('ws://<ip>:33753').on('open', () => { console.log('WS-OK'); process.exit(0); })"`
   - UI serves 200 over the Tailscale IP:
     `curl -o /dev/null -w "%{http_code}\n" http://<ip>:5173/paths`
4. Hand the user `http://<ip>:5173`. Tell them to **hard-refresh** if the
   bundle changed since their last visit.
5. The user confirming the page loads past "initializing environment" is the
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
grep -E 'listening on port|Ready!' /tmp/pipelab-cli.log
curl -o /dev/null -w '%{http_code}\n' "http://$(tailscale ip -4):5173/paths"
```

The expected UI response is `200`. If an old process already owns either
port, stop the old dev process before running `dev-remote` again.
