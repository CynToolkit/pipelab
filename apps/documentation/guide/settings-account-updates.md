# Settings, account, and updates

Open **Settings** from the sidebar to adjust local application preferences.
Some sections are only available when signed in or when Pipelab is running in
development mode.

## General and advanced settings

The General section includes autosave, theme, language, and onboarding tour
controls. Advanced settings include storage and cache information and related
controls. Changes that require a restart are labelled in the app.

Built-in providers ship with Pipelab and are available together. Settings do not
install, uninstall or disable providers. Existing settings files are upgraded
automatically; the unused `plugins[].enabled` list is discarded while theme,
language, cache, temporary folders and other preferences are preserved.

An **integration** configures credentials or an account used by a provider.
Manage these profiles on the **Connections** screen. Saved connections keep
their IDs and credentials during the settings upgrade.

## Account

The account dialog supports signing in, creating an account, and requesting a
password reset. Registration may wait for account validation before sign-in is
available. Subscription and benefit information can affect whether some UI
actions are available; the app's upgrade dialog shows the current state.

In the hosted web app, account sign-in works without the local agent when the
deployment has Supabase configured. Profile and plan information load from the
signed-in browser session. Upgrade and billing-portal requests go through
authenticated cloud functions; if a request fails, retry it from the account or
upgrade screen. Requests show an error after a timeout rather than staying in a
loading state indefinitely. Allow pop-ups in the browser to open the billing
portal or continue to checkout.

Hosted deployments need `SUPABASE_URL` and the public `SUPABASE_ANON_KEY` at UI
build time. Configure the deployed HTTPS origin as an allowed Supabase Auth
redirect URL and serve the UI's `/auth/callback` route through the SPA fallback.
Email verification returns to the hosted app, while password-reset links open a
page to choose a new password. Desktop keeps its `pipelab://` verification
return flow. Privileged Supabase and billing secrets stay on the server and
must not be added to UI build settings.

If account data fails to load, check the connection and retry. A missing
Supabase configuration disables hosted sign-in and shows an unavailable state;
it does not affect the local settings file.

## Desktop updates

The packaged desktop app checks for a newer release. Windows and macOS support
the in-app download and restart flow. Linux shows the manual download path. In
development, update checks are normally disabled unless the app is explicitly
configured to force a check.

For release formats, see [Install and start Pipelab](/guide/installation). For
startup and sign-in issues, see [Troubleshooting](/guide/troubleshooting).
