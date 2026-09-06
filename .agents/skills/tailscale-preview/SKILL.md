# Tailscale Preview — serve the app for remote browser access

Run the Pipelab UI + CLI dev servers so a remote browser (e.g. the developer's
laptop) can open the UI over Tailscale. Use when asked to "start the app",
"preview from tailscale", or expose a dev URL.

## Procedure

1. Confirm Tailscale is up: `tailscale ip -4`. Note the machine IP
   (e.g. `100.111.167.123`). The UI URL is `http://<ip>:5173`.
2. Launch both servers **detached** (stdin from `/dev/null`, own session —
   never plain `&` from a terminal, see Gotchas):
   - CLI: `setsid bash -c 'pnpm --filter @pipelab/cli dev > /tmp/pipelab-cli.log 2>&1 < /dev/null' &`
   - UI: `setsid bash -c 'pnpm --filter @pipelab/ui exec vite --host 0.0.0.0 --port 5173 > /tmp/pipelab-ui.log 2>&1 < /dev/null' &`
   - `disown -a` afterwards if launched from an interactive shell.
3. Wait ~30s. Verify in order:
   - CLI log shows `WebSocket server listening on port 33753` and
     `[Startup Progress] Ready!`: `grep -E 'listening on port|Ready!' /tmp/pipelab-cli.log`
   - CLI process is **not** in `T (stopped)` state:
     `cat /proc/$(pgrep -f 'tsx/dist/loader' | head -1)/status | grep State`
     (must read `S`, never `T`).
   - WebSocket handshake succeeds over the Tailscale IP:
     `node -e "new (require('<repo>/node_modules/ws'))('ws://<ip>:33753').on('open', () => { console.log('WS-OK'); process.exit(0); })"`
   - UI serves 200 over the Tailscale IP:
     `curl -o /dev/null -w "%{http_code}\n" http://<ip>:5173/paths`
4. Hand the user `http://<ip>:5173`. Tell them to **hard-refresh** if the
   bundle changed since their last visit.
5. The user confirming the page loads past "initializing environment" is the
   done gate. The UI stays connected via WebSocket; "initializing
   environment" stuck = the browser can't reach the CLI server.

## Gotchas (learned the hard way)

- **Suspended process**: launching with plain `&` from a terminal leaves the
  process group attached; the kernel SIGSTOPs it (`State: T`,
  `wchan: do_signal_stop`) on terminal I/O and connections pile up in the
  listen backlog (`ss -tln` shows Recv-Q > 0) with zero CPU. Always `setsid`
  + `< /dev/null`. If stuck: `kill -9` the pipeline and relaunch detached.
- **Localhost-only defaults**: the CLI WebSocket server must bind `0.0.0.0`
  (`packages/core-node/src/websocket-server.ts`) and the UI dev client must
  connect to `window.location.hostname`, not `localhost`
  (`apps/ui/src/composables/websocket-client.ts`). Both fixes are in the
  codebase; if remote init hangs, re-check these two lines first.
- **Vite needs `--host 0.0.0.0`** or the dev server only listens on loopback.
- Port `33753` is the CLI WebSocket/API port (`@pipelab/constants`
  `websocketPort`); UI dev port is `5173`.
