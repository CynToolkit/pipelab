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
credentials. The UI command below filters the local public anon key and passes
it under the canonical `SUPABASE_PUBLISHABLE_KEY` variable:

```sh
SUPABASE_PUBLISHABLE_KEY="$(supabase status --output env | sed -n 's/^ANON_KEY=//p' | tr -d '\"')" \
SUPABASE_URL=http://127.0.0.1:54321 VITE_PIPELAB_MODE=hosted \
  pnpm --filter @pipelab/ui dev --host 127.0.0.1 --port 5185
```

The app retains `SUPABASE_ANON_KEY` as a temporary compatibility fallback.
Never pass a service-role or secret key to the UI.

Then run the browser journey:

```sh
EXPECT_EMAIL_CONFIRMATION=1 MAILPIT_URL=http://127.0.0.1:54324 \
SUPABASE_URL=http://127.0.0.1:54321 \
UI_BASE_URL=http://127.0.0.1:5185 \
CHROMIUM_PATH=/usr/bin/chromium \
node apps/ui/tests/browser/hosted-auth-local.cjs
```

The smoke rejects nonlocal Supabase and Mailpit URLs and verifies signup,
refresh restoration, sign-out, sign-in, and no agent WebSocket.

By default, email confirmations are disabled. To verify the confirmation
callback, enable `auth.email.enable_confirmations`, allow
`http://127.0.0.1:5185/auth/callback`, and set
`EXPECT_EMAIL_CONFIRMATION=1` with the local `MAILPIT_URL`.

To exercise password recovery end to end, set `EXPECT_PASSWORD_RESET=1` and
provide the local `MAILPIT_URL`. The journey requests a reset email, follows
the local verification link, updates the password, and signs in with the new
password.

To verify email confirmation against an isolated local Supabase project, enable
`auth.email.enable_confirmations`, allow the local `/auth/callback` redirect,
and set `EXPECT_EMAIL_CONFIRMATION=1` with the local `MAILPIT_URL`.

For signed-in Billing UI failure handling, run the same smoke with
`EXPECT_PLAN_FAILURE_UI=1` or `EXPECT_PORTAL_FAILURE_UI=1`. These modes
intercept only browser calls to `polar-user-plan` or `customer-portal` with
synthetic responses; auth still uses local Supabase, and no Polar request or
billing transaction occurs. They do not replace live billing acceptance.
