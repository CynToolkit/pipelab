# First-run workflow browser journey

Run this UI journey against a local Vite server and the system Chromium:

```sh
UI_BASE_URL=http://127.0.0.1:5175 \
CHROMIUM_PATH=/usr/bin/chromium \
SCREENSHOT_DIR=/tmp \
node apps/ui/tests/browser/first-run-onboarding.cjs
```

The fixture uses the Playwright package already available through `apps/website`
and mocks the WebSocket provider/filesystem boundary. It drives the visible web
file picker and normal dashboard, wizard, and Configuration UI; it does not
mock Vue component state. The Construct and Godot paths cover keyboard source
selection, source-specific picker behavior, the recap, resolved defaults, the
first-blocker action, light/dark rendering, narrow layout, Back navigation,
and a resolver response arriving after the wizard closes. When `SCREENSHOT_DIR`
is set, the run saves recap and Configuration captures there for review.
