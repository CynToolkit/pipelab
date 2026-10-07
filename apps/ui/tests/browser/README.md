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
