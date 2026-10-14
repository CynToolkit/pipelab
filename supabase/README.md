# Pipelab Cloud artifact storage

Cloudflare Workers under the repository's root `workers/` directory own the authenticated artifact API and hourly cleanup. The desktop sends the user's Supabase access token to the `pipelab-cloud` Worker; the Worker verifies it with Supabase Auth, uses the existing database RPCs, and stores artifacts in R2 through the same S3-compatible API in development and production. Builds use `PIPELAB_CLOUD_WORKER_URL`.

## Deploy

1. Apply `migrations/20260916000000_pipelab_cloud_artifacts.sql` to the project database.
2. Configure these Doppler secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. During the migration window, the deploy script still accepts `SUPABASE_ANON_KEY` when the publishable variable is absent. Configure `CLOUDFLARE_API_TOKEN` for Wrangler deployment.
3. Run `mise run deploy:artifacts`. Wrangler deploys the Worker and uploads those Doppler values as Worker secrets.
4. Set `PIPELAB_CLOUD_WORKER_URL` in Doppler to the deployed Worker origin, then build/package Pipelab with Doppler so the desktop and CLI use that origin.
5. Cloudflare's `17 * * * *` Cron Trigger runs cleanup.

The Worker preserves the existing upload actions (`prepareUpload`, `signParts`, `abortUpload`, and `completeUpload`). Its Supabase publishable key is only the project API key; each request's user access token remains in `Authorization` and is verified through Supabase Auth before the operation. Service-role credentials remain server-only. Artifacts are recorded only after R2 confirms their size and metadata. The database pins the latest upload per user and artifact output; unpinned artifacts expire after seven days. Cleanup records each deletion result and retries failures.

For key migration, add `SUPABASE_PUBLISHABLE_KEY` in Doppler, deploy and verify the Worker and client builds, then remove the legacy `SUPABASE_ANON_KEY` alias in a separately reviewed change. The Worker and build configuration prefer the publishable key whenever both names exist.

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

## Polar billing Edge Functions

The Edge Functions preserve the Editor and Desktop UI contracts:

- `polar-available-plans` returns public, active recurring products as `{ plans: [...] }`.
- `polar-user-plan` returns the signed-in user's subscriptions as `{ subscriptions: [...] }`.
- `customer-portal` returns the signed-in customer's portal URL as `{ customerPortal: "..." }`.
- `checkout` accepts `{ itemIds: [...] }`, validates the products, and returns `{ checkoutURL: "..." }`.

The catalog endpoint is public because the upgrade dialog loads plans before sign-in. The other functions require a Supabase access token and validate it with Supabase Auth. The verified user ID supplies Polar's `external_customer_id`; subscription and customer responses are checked against that ID and the configured organization. Client-supplied IDs and email addresses are ignored. The functions need no customer mapping table, service-role key, database migration, or RLS change.

Polar requests are pinned to `https://sandbox-api.polar.sh/v1`; there is no production endpoint override. Portal and checkout URLs are accepted only from HTTPS Polar sandbox hosts. Provider errors and payloads are neither logged nor returned to clients. Checkout creates a sandbox checkout session only when invoked; no checkout was invoked during implementation or testing.

### Local sandbox configuration

Keep these server-only values in the ignored file `supabase/functions/.env.local`. Do not add a `VITE_` prefix:

```dotenv
POLAR_TOKEN=
POLAR_ORGANIZATION_ID=
POLAR_ALLOWED_ORIGINS=http://127.0.0.1:5185,http://localhost:5185
```

`POLAR_TOKEN` must be an organization access token for Polar sandbox. `POLAR_ORGANIZATION_ID` must be that sandbox organization's UUID. Grant the token only the scopes this integration needs: `products:read`, `subscriptions:read`, `customers:read`, `customer_sessions:write`, and `checkouts:write`. See Polar's [product listing](https://polar.sh/docs/api-reference/products/list), [subscription listing](https://polar.sh/docs/api-reference/subscriptions/list), [customer lookup](https://polar.sh/docs/api-reference/customers/get-external), [customer session](https://polar.sh/docs/api-reference/customer-portal/sessions/create), and [checkout session](https://polar.sh/docs/api-reference/checkouts/create-session) API references.

`POLAR_ALLOWED_ORIGINS` is an exact comma-separated origin list; wildcards are rejected. Without it, only the local Editor origins above are allowed. Add each required hosted Editor or Website origin explicitly in the server-side configuration for that nonproduction deployment.

Start the local stack and serve the functions with the ignored local env file:

```sh
supabase start
supabase functions serve --env-file supabase/functions/.env.local
```

If the token or organization ID is absent, billing functions fail closed with `billing_unavailable`. Live sandbox plan, subscription, and portal acceptance requires a verified sandbox token, organization, public recurring products, and a customer linked with the user's Supabase ID. Checkout must remain uncalled during read-only acceptance. No deployed-service inventory or alternate backend source was available for this task; confirm function ownership before deploying to any hosted project.

Run the isolated function tests without credentials or network access:

```sh
deno check supabase/functions/polar-user-plan/index.ts supabase/functions/polar-available-plans/index.ts supabase/functions/customer-portal/index.ts supabase/functions/checkout/index.ts
deno test supabase/functions/_shared/billing.test.ts
```

These mocked tests validate handler behavior and do not replace live sandbox acceptance. Configure secrets only in the intended nonproduction Supabase Edge Function environment. Never put `POLAR_TOKEN` in frontend builds, GitHub build variables, or browser-visible environment files.
