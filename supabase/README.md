# Pipelab Cloud artifact storage

Cloudflare Workers under the repository's root `workers/` directory own the authenticated artifact API and hourly cleanup. The desktop sends the user's Supabase access token to the `pipelab-cloud` Worker; the Worker verifies it with Supabase Auth, uses the existing database RPCs, and stores artifacts in R2 through the same S3-compatible API in development and production. Builds use `PIPELAB_CLOUD_WORKER_URL`.

## Deploy

1. Apply `migrations/20260916000000_pipelab_cloud_artifacts.sql` to the project database.
2. Configure these Doppler secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. Configure `CLOUDFLARE_API_TOKEN` for Wrangler deployment.
3. Run `mise run deploy:artifacts`. Wrangler deploys the Worker and uploads those Doppler values as Worker secrets.
4. Set `PIPELAB_CLOUD_WORKER_URL` in Doppler to the deployed Worker origin, then build/package Pipelab with Doppler so the desktop and CLI use that origin.
5. Cloudflare's `17 * * * *` Cron Trigger runs cleanup.

The Worker preserves the existing upload actions (`prepareUpload`, `signParts`, `abortUpload`, and `completeUpload`). Artifacts are recorded only after R2 confirms their size and metadata. The database pins the latest upload per user and artifact output; unpinned artifacts expire after seven days. Cleanup records each deletion result and retries failures.

## Local development

The root `mise.toml` provides the local commands. `local:setup` installs workspace dependencies, initializes Supabase config if needed, starts the local Supabase stack, and applies pending migrations without resetting local data. The R2 Worker stores objects locally; the API Worker and desktop use the local Supabase credentials reported by the CLI. Run `doppler setup` once from the repository root if this checkout is not already linked to your Doppler project; the app task uses that saved selection for non-Supabase app settings.

Run these in separate terminals from the repository root:

```bash
mise run local:setup
mise run local:r2
mise run local:api
mise run local:app
```

The desktop's normal `mise run dev` remains Doppler-backed for development against the configured cloud services. `mise run local:app` uses Doppler for other app settings but overrides Supabase and the Worker URL to point at the local stack. To trigger retention cleanup locally, run `mise run local:cleanup` while the API Worker is running.

Local R2 is exposed on `127.0.0.1:8787` through the path-style S3-compatible `PutObject`, `HeadObject`, and `DeleteObject` API. The API Worker listens on `127.0.0.1:8788`; its `R2_ENDPOINT_URL` points at the local R2 Worker and uses dummy local credentials. No production R2 credentials are needed locally, and multipart uploads remain production-only.

Wrangler local state and `.dev.vars` files are gitignored. Do not expose the unauthenticated local R2 Worker to an untrusted network.
