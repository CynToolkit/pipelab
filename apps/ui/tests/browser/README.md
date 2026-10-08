# First-run workflow browser journey

Run this UI journey against a local Vite server and the system Chromium:

```sh
UI_BASE_URL=http://127.0.0.1:5173 \
CHROMIUM_PATH=/usr/bin/chromium \
SCREENSHOT_DIR=/tmp \
node apps/ui/tests/browser/first-run-onboarding.cjs
```

The fixture uses the Playwright package already available through `apps/website`
and mocks the WebSocket provider/filesystem boundary. It drives the visible web
file picker and normal dashboard, wizard, and Configuration UI; it does not
mock Vue component state. It covers the six source cards in a fixed 3×2 desktop
grid, source-specific file and folder pickers, multiple selected destinations,
the compact recap, resolved defaults, multiple blocker navigation, and the
contextual Steam connection action. Construct and Godot journeys also cover
light/dark rendering, narrow layout, Back navigation, and a resolver response
arriving after the wizard closes. Set `UI_BASE_URL` to any running UI server;
when `SCREENSHOT_DIR` is set, the run saves Step 1, Destinations, Recap, and
Configuration captures there for review.

## Hosted shell without an agent

Run a hosted-mode UI server and the no-agent shell/preferences journey:

```sh
VITE_PIPELAB_MODE=hosted pnpm --filter @pipelab/ui exec vite --host 0.0.0.0 --port 5183
UI_BASE_URL=http://127.0.0.1:5183 CHROMIUM_PATH=/usr/bin/chromium \
  node apps/ui/tests/browser/hosted-shell.cjs
```

The journey verifies that hosted navigation and browser preferences work
without app WebSocket connections, including when browser storage rejects a
preference change.

## Hosted provider specifications

Start the UI with `VITE_PIPELAB_MODE=hosted` and no local agent, then run:

```sh
UI_BASE_URL=http://127.0.0.1:5175 \
CHROMIUM_PATH=/usr/bin/chromium \
node apps/ui/tests/browser/hosted-provider-specs.cjs
```

This journey opens the real new-workflow wizard, reads packaged source, build,
and destination choices, and edits their fields in the browser-only draft. It
asserts hosted mode opens no agent WebSocket and does not depend on a mocked
`release:catalog:get` response. Creating the workflow stays unavailable until
an agent can validate and save the draft.
