# Develop Pipelab

Pipelab is a pnpm workspace with apps, shared packages, plugins, and Workers. Use the versions pinned in [`mise.toml`](https://github.com/CynToolkit/pipelab/blob/develop/mise.toml): Node.js 24 and pnpm 10.33.0.

## Get the workspace running

```sh
pnpm install
pnpm dev
```

The root `dev` script starts the workspace development setup. The desktop app manages its local CLI server sidecar; for the desktop path, do not start a second CLI server. To work on the standalone UI and remote CLI backend, use `pnpm dev-remote`.

The desktop development scripts use Doppler (`doppler run -- pnpm dev`). If using the plain root script, create a root `.env` as needed:

```dotenv
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
PIPELAB_CLOUD_WORKER_URL=...
POSTHOG_API_KEY=...
```

These values enable Supabase-backed authentication, Pipelab Cloud artifact requests, and PostHog telemetry respectively. They are optional for local development; missing cloud configuration disables the associated cloud functionality, and the CLI warns that authentication is disabled when Supabase is unavailable. Never commit real credentials. Local Supabase and Worker development is available through the `mise run local` tasks; see `mise.toml` and `supabase/README.md` for the local service setup.

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

## Package the desktop app

```sh
pnpm package
pnpm make
```

`package` creates a runnable, unpacked bundle; `make` creates the configured installer/archive for the current host. Both stage the bundled CLI and UI; output is under `apps/desktop/out/`. Release CI separately builds Linux x64, Windows x64, macOS x64, and macOS arm64. This matrix does not establish that local packaging works identically on every host or define minimum end-user OS versions. See [Release Pipelab](/contributing/releases) for publication workflows.

## Documentation

Product documentation lives in `apps/documentation`. When a code change affects documented behavior, update the relevant page in the same change. Use `pnpm docs` to develop the site and `pnpm docs:build` to build it. Follow the repository's `AGENTS.md` for evidence, links, and scope-specific verification expectations.
