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

To run just the saved-Connection layout regression from the Configuration
destination editor, use `CONNECTION_LAYOUT_ONLY=1` with the same server and
Chromium settings. It opens the workflow alias details and checks the selector
and Add control bounds in a real browser.

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
change. The auth check accepts both deployment states: configured public
Supabase browser settings must expose a usable sign-in flow while the agent is
detached; absent settings must show the existing configuration notice. Set
`EXPECT_BROWSER_AUTH=present` or `EXPECT_BROWSER_AUTH=absent` to require one
state explicitly. Hosted mode controls startup discovery only; a later paired
attach can connect an agent without rebuilding or reloading.

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
credentials. The UI command filters the local public anon key and passes it
under the canonical `SUPABASE_PUBLISHABLE_KEY` variable:

```sh
SUPABASE_PUBLISHABLE_KEY="$(supabase status --output env | sed -n 's/^ANON_KEY=//p' | tr -d '\"')" \
SUPABASE_URL=http://127.0.0.1:54321 VITE_PIPELAB_MODE=hosted \
  pnpm --filter @pipelab/ui dev --host 127.0.0.1 --port 5185
```

The app retains `SUPABASE_ANON_KEY` as a temporary compatibility fallback.
Never pass a service-role or secret key to the UI.

Then run the browser journey:

```sh
EXPECT_EMAIL_CONFIRMATION=1 EXPECT_PASSWORD_RESET=1 MAILPIT_URL=http://127.0.0.1:54324 \
SUPABASE_URL=http://127.0.0.1:54321 \
UI_BASE_URL=http://127.0.0.1:5185 \
CHROMIUM_PATH=/usr/bin/chromium \
node apps/ui/tests/browser/hosted-auth-local.cjs
```

The smoke rejects nonlocal Supabase and Mailpit URLs. With both optional modes
enabled, it verifies signup, email verification, password recovery, session
restoration, sign-out, sign-in with the reset password, and no agent WebSocket.
With `VITE_PIPELAB_BILLING_ENABLED` unset, it also verifies Billing is clearly
unavailable, no plan/portal/checkout controls are shown, and no billing
functions are requested. For signed-in Billing UI failure handling, start the
local Vite server with `VITE_PIPELAB_BILLING_ENABLED=true` and set
`EXPECT_BILLING_DISABLED=0` together with `EXPECT_PLAN_FAILURE_UI=1` or
`EXPECT_PORTAL_FAILURE_UI=1`; these modes use synthetic browser responses and
stay on local URLs without calling Polar.

## Local auth and mocked billing validation

Use the local Supabase stack and Mailpit for auth journeys. Billing tests use
mocked Polar and Supabase responses; they need no Polar account, sandbox
credentials, hosted Supabase project, or external provider calls. Do not serve
the billing functions with real Polar credentials for these checks.

Run the focused automated tests from the repository root:

```sh
pnpm --filter @pipelab/ui exec vitest run src/store/auth.test.ts
deno test supabase/functions/_shared/billing.test.ts
```

The browser auth journey above additionally needs Docker running so local
Supabase and Mailpit are available. It exercises real local signup, email
verification, password recovery, session restore, sign-in, and sign-out. The
billing-disabled browser path checks that billing controls and requests remain
off by default. The signed-in billing failure modes intercept function
responses locally to check error UI.

For broader local-only checks, the Supabase function checks are listed in
`supabase/README.md`. Record which local command ran and its result in the PR
acceptance notes. Do not report mocked provider responses as live Polar
checkout or customer-portal validation.

These local runs do not exercise live checkout, a Polar customer portal, or
Desktop IPC. Edge Function endpoint URLs come from server-side environment
variables, and local tests stub provider requests, so they do not need Polar
credentials or a Polar deployment. Never put `POLAR_ACCESS_TOKEN` or legacy
`POLAR_TOKEN` in frontend builds or browser-visible environment files.
