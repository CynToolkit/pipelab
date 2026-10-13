# @pipelab/ui (The Interface)

The main visual interface for Pipelab, built with Vue 3 and PrimeVue.

## 🎨 Role & Connectivity

The UI is a "thin client" designed to configure and run Release workflows. It does not execute logic directly; instead, it orchestrates the `@pipelab/cli` engine.

### Connection Discovery

When the UI starts, it attempts to connect to the Pipelab Engine (CLI process):

1.  **Discovery**: It looks for a running engine on the configured port (default: `33753`).
2.  **Streaming**: Once connected, it receives real-time execution logs and progress updates via WebSockets.
3.  **Authentication**: Desktop syncs authentication through the engine. Browser builds use their own Supabase session for account and billing features; connecting or disconnecting an agent does not replace that identity.

## 🛠️ Development

### Tech Stack

- **Framework**: Vue 3 (Composition API)
- **UI Library**: PrimeVue v4
- **State**: Pinia
- **Icons**: PrimeIcons / Lucide

### Commands

```bash
pnpm dev        # Starts the Vite development server (port 5173)
pnpm build      # Generates the production assets in the /dist folder
```

> [!NOTE]
> During development, the UI expects the `@pipelab/cli` to be running separately (via `pnpm dev` at the root).

### Browser startup without an agent

Select the hosted startup policy for a standalone browser deployment:

```bash
VITE_PIPELAB_MODE=hosted pnpm --filter @pipelab/ui build
```

The hosted startup policy skips agent discovery and keeps navigation and
browser preferences available without an agent. It only controls startup:
after secure pairing is available, the browser can attach an agent in the same
session, and agent-backed capabilities follow the live connection state.
Local workflows, machine settings, and execution require a connected agent. A
browser build without this flag attempts agent discovery on startup; Electron
always attempts startup connection even if the flag is present.

## Hosted auth and browser security (maintainer decision)

Hosted mode currently creates a Supabase browser client with PKCE, automatic
refresh, and persisted sessions. Signup and password recovery return to the
SPA's `/auth/callback`; billing functions are invoked with the browser client.
Desktop auth remains in the agent and is exposed to the UI over IPC. These are
implementation facts, not security acceptance: maintainers still need to
choose an auth direction and approve a deployment-specific CSP.

### Option A: browser-managed Supabase session

Keep Supabase JS in the SPA and harden the browser boundary. This is the
smallest change and retains the current signup, sign-in, recovery, refresh, and
billing flow. Use PKCE, minimize third-party scripts, prevent injection with
dependency review and output encoding, and deploy a restrictive CSP. This
reduces script injection opportunities but does not make an XSS harmless:
JavaScript executing in the origin can act as the user and may read persisted
session tokens from browser storage. CSP rollout also needs compatibility work
for the existing inline bootstrap script/styles and any runtime style
injection; avoid `unsafe-inline` and `unsafe-eval` where possible.

Deployment must provide the hosted-mode build, its Supabase URL and public
anon key, an SPA fallback for `/auth/callback`, and matching Supabase Auth
allowed redirect URLs and email templates. No backend is required. Migration
is limited to preserving the current browser session and callback contract;
changing storage strategy or PKCE behavior would require explicit sign-in,
refresh, logout, and recovery migration handling.

### Option B: server-mediated HttpOnly session cookies

Move hosted auth to a same-origin server/BFF that exchanges Supabase auth
results for `Secure`, `HttpOnly`, appropriately `SameSite` cookies. This keeps
refresh tokens inaccessible to page JavaScript and reduces token theft from
XSS, but XSS can still issue authenticated actions; cookie-authenticated
mutations also need CSRF/origin protections. The BFF adds substantial work:
server routes, session lifecycle and refresh, CSRF defenses, secret handling,
monitoring, and a maintained server runtime. Static Vite/Pages assets alone
cannot provide this session boundary.

The BFF must own OAuth and email confirmation callbacks, password reset and
recovery exchanges, cookie issuance/clearing, and authorization for billing
operations. Checkout, plan lookup, and customer portal calls currently invoke
Supabase functions from the SPA; they would need a server proxy or a carefully
defined authenticated API. Desktop continues to use its agent/IPC auth path
unless a separate migration is chosen. Migration must define callback URLs,
session invalidation and transition from browser-stored sessions, then update
UI auth transport, error/retry states, and the hosted deployment from static
assets to the BFF.

### CSP and deployment

Do not claim a complete CSP for this static Vite/Pages project without the
actual deployment origin allowlist and tested preview topology. At minimum,
inventory `script-src`, `style-src`, `font-src`, `img-src`, `connect-src`, and
`frame-src` against each deployment. Connections may include the configured
Supabase origin (Auth, REST, Functions, and Realtime as used), agent WebSockets
(`ws://`/`wss://` hosts, including local and remote development endpoints),
and `https://eu.i.posthog.com`. Website/editor previews, Supabase Auth
callbacks, and any preview iframe or popup origins must be evaluated for the
actual environment; do not use broad wildcards to cover unknown preview hosts.

The current `index.html` contains inline bootstrap CSS and JavaScript, and the
UI uses component/runtime styles. Prefer moving bootstrap code to external
files or authorizing stable hashes/nonces where the serving layer can inject
nonces, and test whether framework styles need a targeted exception. Do not
paper over violations with `unsafe-inline` or `unsafe-eval` without a reviewed
need. Configure headers in the deployment layer only after origins and
directives are agreed; start with report-only, collect violations on production
and preview builds, then enforce and verify auth callbacks, billing, telemetry,
fonts, previews, and agent WebSocket connection in real browsers. `vite dev` /
`vite preview` results do not establish the production Pages header behavior.
No CSP header or production infrastructure change is made by this README.
