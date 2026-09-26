# Settings, account, and updates

Open **Settings** from the sidebar to adjust local application preferences.
Some sections are only available when signed in or when Pipelab is running in
development mode.

## General and advanced settings

The General section includes autosave, theme, language, and onboarding tour
controls. Advanced settings include storage and cache information and related
controls. Changes that require a restart are labelled in the app.

In the bundled desktop app, developer-only plugin and connection management
screens may be hidden. Do not rely on development-only routes as ordinary
desktop settings.

## Account

The account dialog supports signing in, creating an account, and requesting a
password reset. Registration may wait for account validation before sign-in is
available. Subscription and benefit information can affect whether some UI
actions are available; the app's upgrade dialog shows the current state.

If account data fails to load, check the connection and try again. Pipelab's
account service and billing actions are external to the local settings file;
this guide does not promise a specific billing portal outcome.

## Desktop updates

The packaged desktop app checks for a newer release. Windows and macOS support
the in-app download and restart flow. Linux shows the manual download path. In
development, update checks are normally disabled unless the app is explicitly
configured to force a check.

For release formats, see [Install and start Pipelab](/guide/installation). For
startup and sign-in issues, see [Troubleshooting](/guide/troubleshooting).
