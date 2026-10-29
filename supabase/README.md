# Pipelab Cloud artifact storage

Cloudflare Workers under the repository's root `workers/` directory own the authenticated artifact API and hourly cleanup. Desktop and the local CLI send the user's Supabase access token to the `pipelab-cloud` Worker; the Worker verifies it with Supabase Auth, resolves paid plans through `polar-user-plan`, and stores objects in R2. The browser UI uses `PIPELAB_CLOUD_WORKER_URL` for the Cloud Files page. CI uploads and CI tokens are deferred.

## Deploy

1. Apply the artifact migrations in order: `20260916000000_pipelab_cloud_artifacts.sql`, `20261026000000_pipelab_cloud_artifact_identity.sql`, `20261027000000_pipelab_cloud_warning_claim_fix.sql`, `20261028000000_pipelab_cloud_reconcile_before_deletion.sql`, `20261029000000_pipelab_cloud_lifecycle_retries.sql`, and `20261030000000_pipelab_cloud_indie_plan_limit.sql`.
2. Deploy all Supabase Edge Functions in this checkout, including browser billing and `pipelab-cloud-reconcile`, to the approved project with `SUPABASE_PROJECT_REF` set. Configure the existing production Polar credentials and endpoint values listed below in the target project's Edge Function environment.
3. Configure these server-only Doppler secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `PIPELAB_CLOUD_LINK_ENCRYPTION_KEY`, `RESEND_API_KEY`, and `PIPELAB_CLOUD_FROM_EMAIL`. During the key migration window, the deploy script still accepts `SUPABASE_ANON_KEY` when the publishable variable is absent. Configure `CLOUDFLARE_API_TOKEN` for Wrangler deployment.
4. The last migration seeds a Basic allowance for the production Polar Indie product ID `4f3a3e6f-5195-4583-9488-e06108ac7547`: `quota_bytes = 1073741824` (1 GiB) and 30-day history retention. It leaves an existing row for that product unchanged; verify any existing row has the intended values. The owner approved the allowance using the internal four-target Electron sample as synthetic quota evidence. Its ZIPs total 575,081,265 bytes, leaving 498,660,559 bytes of headroom. This confirms packaged-byte accounting but does not represent customer game sizes. Higher-tier numeric values remain unset. Configure production endpoint URLs for hosted functions so production subscriptions match the seeded production product row. Uploads fail closed without a matching enabled row.
5. Run `mise run deploy:artifacts`. Wrangler deploys the Worker and uploads those Doppler values as Worker secrets.
6. Set `PIPELAB_CLOUD_WORKER_URL` in Doppler to the deployed Worker origin, then build/package Pipelab with Doppler so Desktop, the UI, and the local CLI use that origin.
7. Cloudflare's `17 * * * *` Cron Trigger handles entitlement reconciliation, expired upload reservations, subscription grace, warning emails, artifact deletion, and cleanup retries.

The Worker owns upload, private listing, download, share-link, revoke, and delete operations. Its Supabase publishable key is only the project API key; each authenticated request's user access token stays in `Authorization` and is verified through Supabase Auth. Service-role and R2 credentials remain server-only. Uploads reserve pooled quota before signing an upload and are committed only after R2 confirms object size and metadata. The latest successful artifact is pinned per user, project, Build Profile, and target. Unpinned history uses the retention days configured for the paid plan. Owner and post-grace deletions revoke links before removing objects; cleanup retries failures.

Share links use an unguessable random token. The database stores its SHA-256 hash for public lookup and an AES-GCM encrypted copy so the owner can retrieve it. Generate `PIPELAB_CLOUD_LINK_ENCRYPTION_KEY` as 32 random bytes encoded as unpadded base64url (for example, `openssl rand -base64 32 | tr '/+' '_-' | tr -d '='`), and retain the same value across Worker deployments. Rotating this key makes existing links impossible to retrieve; revoke and recreate those links before rotating it.

Subscription grace begins at the actual paid-through date and lasts 30 days. Existing artifacts and links remain accessible during grace; uploads and new links require an active paid period. Seven days before cleanup, the Worker adds an in-app notice and sends an email through Resend. The sender address must be authorized in the Resend account.

For key migration, add `SUPABASE_PUBLISHABLE_KEY` in Doppler, deploy and verify the Worker and client builds, then remove the legacy `SUPABASE_ANON_KEY` alias in a separately reviewed change. The Worker and build configuration prefer the publishable key whenever both names exist.

## Local development

The root `mise.toml` provides the local commands. `local:setup` installs workspace dependencies, initializes Supabase config if needed, starts the local Supabase stack, and applies pending migrations without resetting local data. The R2 Worker stores objects locally; the API Worker and desktop use the local Supabase credentials reported by the CLI. The API Worker receives the local R2 endpoint as a Wrangler binding so its signed upload URLs target the local R2 Worker. Run `doppler setup` once from the repository root if this checkout is not already linked to your Doppler project; the app task uses that saved selection for non-Supabase app settings.

Run these in separate terminals from the repository root:

```bash
mise run local:setup
mise run local:r2
mise run local:api
mise run local:app
```

The desktop's normal `mise run dev` remains Doppler-backed for development against the configured cloud services. `mise run local:app` uses Doppler for other app settings but overrides Supabase and the Worker URL to point at the local stack. To trigger retention cleanup locally, run `mise run local:cleanup` while the API Worker is running.

Local R2 is exposed on `127.0.0.1:8787` through the path-style S3-compatible `PutObject`, `HeadObject`, and `DeleteObject` API. The API Worker listens on `127.0.0.1:8788`; its `R2_ENDPOINT_URL` points at the local R2 Worker and uses dummy local credentials. No production R2 credentials are needed locally, and multipart uploads remain production-only. Set a local `PIPELAB_CLOUD_LINK_ENCRYPTION_KEY` for share-link development. CLI Cloud sign-in requires an interactive terminal and stores its session in the operating system credential store.

Wrangler local state and `.dev.vars` files are gitignored. Do not expose the unauthenticated local R2 Worker to an untrusted network.

## Polar billing Edge Functions

The Edge Functions preserve the Editor and Desktop UI contracts and reconcile Cloud entitlements:

- `polar-available-plans` returns public, active recurring products as `{ plans: [...] }`.
- `polar-user-plan` returns the signed-in user's subscriptions as `{ subscriptions: [...] }`.
- `customer-portal` returns the signed-in customer's portal URL as `{ customerPortal: "..." }`.
- `checkout` accepts `{ itemIds: [...] }`, validates the products, and returns `{ checkoutURL: "..." }`.
- `pipelab-cloud-reconcile` is an internal Worker-only function. It checks the active/canceled Polar subscription state for a bounded batch of Cloud accounts and updates their active-through or grace dates. JWT verification is disabled at the gateway so the function can validate the exact service-role bearer itself; do not call it from a browser.

The catalog endpoint is public because the upgrade dialog loads plans before sign-in. The user-facing billing functions require a Supabase access token and validate it with Supabase Auth. The verified user ID supplies Polar's `external_customer_id`; subscription and customer responses are checked against that ID and the configured organization. Client-supplied IDs and email addresses are ignored. The internal Cloud reconciler accepts only the exact server-side service-role bearer and uses the artifact migration's private plan and account tables.

Billing and entitlement reconciliation read endpoint URLs from the server-side Supabase function environment; there is no environment selector or compiled-in Polar host. The endpoint URLs must use HTTPS, except that HTTP is allowed for local hosts. API/Auth fetches reject redirects so bearer credentials cannot be forwarded to another host. Portal and checkout URLs must use a configured endpoint origin; the path comes from the Polar response. Provider errors and payloads are neither logged nor returned to clients. Checkout creates a session only when invoked; no checkout was invoked during implementation or testing.

### Browser billing deployment

Billing is available in every Editor build, including `develop` and previews.
The UI needs `SUPABASE_URL` plus `SUPABASE_PUBLISHABLE_KEY` (or the temporary
`SUPABASE_ANON_KEY` fallback) as GitHub secrets. These are public client
configuration values. The Polar token is never added to the browser build.

For the production Supabase project, configure these Edge Function values:

- `POLAR_API_BASE_URL=https://api.polar.sh/v1`
- `POLAR_FRONTEND_BASE_URL=https://polar.sh`
- `POLAR_CHECKOUT_LINK_BASE_URL=https://buy.polar.sh`
- `POLAR_ACCESS_TOKEN` from the production Polar organization (`POLAR_TOKEN` is also accepted for existing deployments)
- `POLAR_SERVER=production` is the existing Polar SDK server-mode setting; it is not an API URL and is not used by these direct HTTP requests
- `POLAR_ORGANIZATION_ID` for that organization
- `POLAR_ALLOWED_ORIGINS` as the comma-separated exact HTTPS origins allowed
  to call browser billing functions

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Authenticate the Supabase CLI,
set `SUPABASE_PROJECT_REF` to the approved project, then deploy all Edge
Functions in this checkout, including billing and Cloud reconciliation:

```sh
SUPABASE_PROJECT_REF=your-project-ref mise run deploy:supabase-functions
```

Cloud Files storage itself uses R2; browser billing does not need R2 or D1. Do
not run this deploy command for local tests. The mocked tests below use local
code and make no Polar API requests.

### Local validation

Run the isolated function tests without credentials or network access. The
billing tests inject fake configuration and mock provider and Auth responses;
they do not contact Polar or require a Polar sandbox account:

```sh
deno check supabase/functions/polar-user-plan/index.ts supabase/functions/polar-available-plans/index.ts supabase/functions/customer-portal/index.ts supabase/functions/checkout/index.ts
deno test supabase/functions/_shared/polar-config.test.ts supabase/functions/_shared/billing.test.ts
deno check supabase/functions/pipelab-cloud-reconcile/index.ts
deno test supabase/functions/pipelab-cloud-reconcile/index.test.ts
mise exec -- supabase test db
mise exec -- node supabase/tests/pipelab_cloud_quota_concurrency.mjs
```

The database tests use only the local Supabase project. The concurrency check requires `supabase start` and opens two independent local database connections. The mocked function tests configure all endpoint variables to loopback URLs and replace `fetch`, so they make no network requests and need no Polar account or credentials. For `supabase functions serve`, set the API endpoint and frontend/checkout endpoints in the ignored `supabase/functions/.env` or pass an env file to the CLI; the existing `POLAR_SERVER=production` SDK setting is separate from these URLs. Use local mock endpoints when exercising billing calls. See `apps/ui/tests/browser/README.md` for local browser auth and mocked billing UI journeys. Never put `POLAR_ACCESS_TOKEN` or legacy `POLAR_TOKEN` in frontend builds, GitHub build variables, or browser-visible environment files.
