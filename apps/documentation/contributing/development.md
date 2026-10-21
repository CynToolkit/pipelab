# Develop Pipelab

Pipelab is a pnpm workspace with apps, shared packages, providers, and Workers. Use the versions pinned in [`mise.toml`](https://github.com/CynToolkit/pipelab/blob/develop/mise.toml): Node.js 24 and pnpm 10.33.0.

## Get the workspace running

```sh
pnpm install
pnpm dev
```

The root `dev` script starts the workspace development setup. The desktop app starts its own CLI server on a per-launch loopback port and verifies it before loading the UI; for the desktop path, do not start a second CLI server. Vite HMR remains active for UI work. Restart Desktop after changing CLI server source. To work on the standalone UI and remote CLI backend, use `pnpm dev-remote`.

The desktop development scripts use Doppler (`doppler run -- pnpm dev`). If using the plain root script, create a root `.env` as needed:

```dotenv
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
PIPELAB_CLOUD_WORKER_URL=...
POSTHOG_API_KEY=...
```

These values enable Supabase-backed authentication, Pipelab Cloud artifact requests, and PostHog telemetry respectively. `SUPABASE_PUBLISHABLE_KEY` is the canonical browser/client key; existing local env files may temporarily use `SUPABASE_ANON_KEY`, with the publishable key taking precedence if both are set. They are optional for local development; missing cloud configuration disables the associated cloud functionality, and the CLI warns that authentication is disabled when Supabase is unavailable. Never commit real credentials. Local Supabase and Worker development is available through the `mise run local` tasks; see `mise.toml` and `supabase/README.md` for the local service setup.

To run the standalone UI and CLI backend without starting local Supabase or either Wrangler Worker, use:

```sh
mise run local ui-no-cloud
```

This mode clears Supabase and Pipelab Cloud configuration for the processes it starts, so authentication, billing, telemetry, and cloud artifact requests are unavailable. Use `mise run local ui` when you need local Supabase or Pipelab Cloud features.

Browser billing is disabled by default. For local-only billing acceptance, start
the local Supabase functions with Polar sandbox configuration and set
`VITE_PIPELAB_BILLING_ENABLED=true` for the Editor build. The automated Editor
deployment workflow explicitly sets the flag to `false`; do not enable a
hosted build until its billing backend and configuration are deliberately
validated.

To run the UI as a hosted browser shell without starting an agent connection,
set `VITE_PIPELAB_MODE=hosted` for the UI build. This only skips agent
discovery at startup; later pairing can attach an agent in the same session.
Browser account identity always comes from the browser's Supabase session and
does not change when an agent connects or disconnects. Browser account features
need `SUPABASE_URL` and the public `SUPABASE_PUBLISHABLE_KEY` (with the
temporary `SUPABASE_ANON_KEY` fallback). For email verification
and password recovery, add the exact HTTPS deployment origin and its
`/auth/callback` route to Supabase Auth's allowed redirect URLs and configure
the host's SPA fallback. Desktop builds keep the `pipelab://` verification
flow; do not expose service-role or billing secrets in UI environment values.

### Local browser auth acceptance

The checked-in local Supabase config enables email confirmation, sets the Auth
site URL to `http://127.0.0.1:5185`, and allows the exact Editor callback
`http://127.0.0.1:5185/auth/callback`. Local SMTP is captured by Mailpit at
`http://127.0.0.1:54324`; it does not send real email. Start the local stack
with `supabase start`, then run the hosted Editor on port `5185` with only the
local API URL and public anon key. Use the full confirmation and recovery
journey documented in the repository file `apps/ui/tests/browser/README.md`.
Do not print or evaluate all of `supabase status` output: it also includes
local service credentials. Never use production values for this journey.

## Focus a package

Use the workspace name and package scripts to keep iteration focused:

```sh
pnpm --filter @pipelab/cli dev
pnpm --filter @pipelab/cli test
pnpm --filter @pipelab/cli typecheck
pnpm --filter @pipelab/ui test
pnpm --filter @pipelab/ui typecheck
```

Root `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` delegate to Turbo. Turbo task ordering and outputs are defined in `turbo.json`; use workspace scripts rather than inventing a build order. CLI end-to-end, workflow, and provider tests run in the CLI host under `apps/cli/tests/e2e`. UI behavior belongs in UI tests. The Electron startup smoke is manual-only and is not a feature-test harness.

### Cross-platform local release CI

Push and pull request CI runs credential-free local release, run-history,
artifact IPC, and Construct profile validation tests on Linux, Windows, and
macOS, regardless of branch. It does not launch Electron; the minimal startup
smoke remains manual-only. Authenticated Construct-to-Electron acceptance is
an explicit workflow dispatch with `Run authenticated local Ship` enabled.
The dispatch runs after the credential-free platform matrix passes; pushes
and pull requests do not access Construct secrets. It requires the
`CONSTRUCT_CI_USERNAME` and `CONSTRUCT_CI_PASSWORD` GitHub Actions secrets for
a dedicated test account. CI creates a temporary Chromium profile by signing
in through the Construct editor, ships twice across Desktop cold starts, and
checks the reopened run history and artifacts. The profile is removed with
the hosted runner. Never copy a developer's browser profile into CI. The
dispatch fails clearly if either secret is missing, so the live acceptance
cannot silently pass without running. Regular push and pull request tests
remain credential-free.

The UI dev server also allows assets from the resolved workspace `node_modules`
directory. When a Git worktree shares dependencies through a symlink, icon fonts
remain available through the normal UI dev command.

## Package the desktop app

```sh
pnpm package
pnpm make
```

`package` creates a runnable, unpacked bundle; `make` creates the configured installer/archive for the current host. Both stage the bundled CLI and UI; output is under `apps/desktop/out/`. Release CI separately builds Linux x64, Windows x64, macOS x64, and macOS arm64. This matrix does not establish that local packaging works identically on every host or define minimum end-user OS versions. See [Release Pipelab](/contributing/releases) for publication workflows.

## Documentation

Product documentation lives in `apps/documentation`. When a code change affects documented behavior, update the relevant page in the same change. Use `pnpm docs` to develop the site and `pnpm docs:build` to build it. Follow the repository's `AGENTS.md` for evidence, links, and scope-specific verification expectations.
