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
file picker and normal Dashboard, Workflows, wizard, and Configuration UI; it
does not mock Vue component state. It verifies that Dashboard and Workflows are
separate routes, that browser back/forward works, and that workflow detail
routes keep Workflows active. The connected-agent journey also switches,
creates, renames, and deletes projects and checks selection across routes. It
covers the six source cards in a fixed 3×2 desktop
grid, source-specific file and folder pickers, multiple selected destinations,
the compact recap, resolved defaults, multiple blocker navigation, and the
contextual Steam connection action. Construct and Godot journeys also cover
light/dark rendering, narrow layout, Back navigation, and a resolver response
arriving after the wizard closes. Set `UI_BASE_URL` to any running UI server;
when `SCREENSHOT_DIR` is set, the run saves Step 1, Destinations, Recap, and
Configuration captures there for review.
It also saves representative empty/populated Dashboard and Workflows screenshots
at desktop and narrow widths in the selected theme.

## Hosted shell without an agent

Run a hosted-mode UI server and the no-agent shell/preferences journey:

```sh
VITE_PIPELAB_MODE=hosted pnpm --filter @pipelab/ui exec vite --host 0.0.0.0 --port 5183
UI_BASE_URL=http://127.0.0.1:5183 CHROMIUM_PATH=/usr/bin/chromium \
  node apps/ui/tests/browser/hosted-shell.cjs
```

The journey verifies that hosted navigation and browser preferences work
without app WebSocket connections, confirms the selected locale is rendered
after changing it and after reload, and checks that agent-backed guide reset is
disabled while detached. It also covers browser storage rejecting a preference
change. Hosted mode controls startup discovery only; a later paired attach can
connect an agent without rebuilding or reloading.
