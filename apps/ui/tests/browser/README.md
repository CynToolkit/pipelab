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

## Hosted provider specifications with a connected agent

Run the UI without `VITE_PIPELAB_MODE=hosted` so browser startup connects to the
local test agent, then run the paired journey:

```sh
pnpm --filter @pipelab/ui exec vite --host 127.0.0.1 --port 5175
UI_BASE_URL=http://127.0.0.1:5175 CHROMIUM_PATH=/usr/bin/chromium \
  node apps/ui/tests/browser/hosted-provider-connected.cjs
```

This journey supplies a mocked agent over the local WebSocket boundary. It
checks that the browser wizard loads dynamic build options after connecting and
clearly defers destination account setup to Configuration.

## Local hosted auth

Run against the local Supabase stack. Do not evaluate or log the complete
`supabase status --output env` output because it also contains server-only
credentials. If you need to inspect CLI values, filter to public values only:

```sh
supabase status --output env | awk -F= '$1 ~ /^(API_URL|ANON_KEY|PUBLISHABLE_KEY|SUPA_API_URL|SUPA_ANON_KEY|SUPA_PUBLISHABLE_KEY)$/'
```

Use only the local API URL and public key in an ignored local environment file,
preferring `SUPABASE_PUBLISHABLE_KEY` and retaining `SUPABASE_ANON_KEY` as a
temporary fallback. Never pass a service-role or secret key to the UI.

Start the UI in a separate terminal:

```sh
VITE_PIPELAB_MODE=hosted pnpm --filter @pipelab/ui dev --host 127.0.0.1 --port 5185
```

Then run the browser journey:

```sh
SUPABASE_URL=http://127.0.0.1:54321 \
UI_BASE_URL=http://127.0.0.1:5185 \
CHROMIUM_PATH=/usr/bin/chromium \
node apps/ui/tests/browser/hosted-auth-local.cjs
```

It creates a throwaway local auth user and verifies signup, session restore
after refresh, sign-out, and sign-in without an agent WebSocket. When local
email confirmation is enabled, the journey must also use Mailpit to complete
the verification callback; this smoke alone does not verify password recovery,
profile/plan service data, or billing.
