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

## Local hosted auth

Run against a local Supabase stack with email confirmations disabled. Start the
UI in a separate terminal; this exports only the local API URL and anon key to
the UI process, not the local service-role key:

```sh
SUPABASE_ANON_KEY="$(supabase status --output env | sed -n 's/^ANON_KEY=//p' | tr -d '\"')" \
SUPABASE_URL=http://127.0.0.1:54321 VITE_PIPELAB_MODE=hosted \
  pnpm --filter @pipelab/ui dev --host 127.0.0.1 --port 5185
```

The command passes only the local API URL and public anon key to Vite; do not
`eval` the full output of `supabase status`, which also contains local secret
keys.

Then run the browser journey:

```sh
SUPABASE_URL=http://127.0.0.1:54321 \
UI_BASE_URL=http://127.0.0.1:5185 \
CHROMIUM_PATH=/usr/bin/chromium \
node apps/ui/tests/browser/hosted-auth-local.cjs
```

It creates a throwaway local auth user and verifies signup, session restore
after refresh, sign-out, and sign-in without an agent WebSocket. By default it
assumes email confirmations are disabled. The optional mode below exercises
local confirmation delivery; neither mode verifies Polar billing, which needs
the hosted nonproduction acceptance environment.

To also exercise password recovery end to end, set `EXPECT_PASSWORD_RESET=1`
and provide a local `MAILPIT_URL`. The journey requests a reset email, follows
its local verification link, updates the password, and signs in with the new
password. It still does not verify hosted billing.

To also verify email confirmation against an isolated local Supabase project,
enable `auth.email.enable_confirmations`, allow the local `/auth/callback`
redirect, and set `EXPECT_EMAIL_CONFIRMATION=1` and `MAILPIT_URL` to that
project's local Mailpit URL. The smoke rejects nonlocal Supabase and Mailpit
URLs. No billing transaction is performed; the local plan Edge Function may
be absent.

To verify the signed-in Billing UI's unavailable-plan and failed-portal states,
run the same smoke with `EXPECT_PLAN_FAILURE_UI=1` or
`EXPECT_PORTAL_FAILURE_UI=1`. These modes intercept only the local browser's
`polar-user-plan` and `customer-portal` calls with synthetic responses; auth
still uses local Supabase, and no Polar request or billing transaction occurs.
Run the modes separately. They assert that plan failures show an error and can
be retried, and that portal failures show a user-facing message.
