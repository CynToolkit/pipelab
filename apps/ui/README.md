# @pipelab/ui (The Interface)

The main visual interface for Pipelab, built with Vue 3 and PrimeVue.

## 🎨 Role & Connectivity

The UI is a "thin client" designed to configure and run Release workflows. It does not execute logic directly; instead, it orchestrates the `@pipelab/cli` engine.

### Connection Discovery

When the UI starts, it attempts to connect to the Pipelab Engine (CLI process):

1.  **Discovery**: Standalone browser development uses the configured engine port (default: `33753`). Desktop uses the per-launch loopback address supplied by its verified CLI server.
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
pnpm dev        # Starts Vite on IPv4 loopback (port 5173)
pnpm build      # Generates the production assets in the /dist folder
```

> [!NOTE]
> With root `pnpm dev`, Desktop manages its own authenticated CLI sidecar. Use `pnpm dev-remote` for standalone UI development with a separate remote CLI.

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

## Hosted auth and browser security

Hosted mode currently creates a Supabase browser client with PKCE, automatic
refresh, and persisted sessions. Signup and password recovery return to the
SPA's `/auth/callback`; billing functions are invoked with the browser client.
Desktop auth remains in the agent and is exposed to the UI over IPC. These are
implementation facts. The October 14, 2026 maintainer handoff selected the
browser-managed session model and a Report-Only CSP rollout; the residual
JavaScript-readable token risk remains documented below.

The browser client uses `persistSession: true`, `autoRefreshToken: true`,
`flowType: "pkce"`, and `detectSessionInUrl: false`; the callback route clears
the query/hash before exchanging the code and continues to a fixed Dashboard
route. Billing is available in every Editor build. Browser plan, checkout, and
portal requests use Supabase Edge Functions; account-specific operations are
authenticated. Configuration, network, and authorization failures appear as
errors with retry controls. Auth and profile remain usable when billing fails.
Desktop keeps its existing IPC auth and billing transport.

Local browser validation uses mocked billing responses; it does not contact
Polar. Hosted Edge Functions read the Polar API, frontend, and checkout-link
URLs from server-side environment variables. The production values are
documented in the repository's
[`supabase/README.md`](../../supabase/README.md) for production configuration
and function deployment instructions. Keep Polar credentials server-side.

Supabase JS uses `localStorage` by default, which remains readable by
same-origin JavaScript, so automatic refresh does not protect a token from XSS.
Signout resets the analytics identity and clears the corresponding browser or
Desktop session through its existing auth transport. Desktop auth logs now
contain event labels only, not account emails or passwords. No specific
exploitable XSS path was found in this review. The source audit found no
`v-html`, `innerHTML`, `document.write`, `eval`, or
`new Function` usage in the UI. `index.html` has no external script tag; the UI
bundles PostHog and loads Google Fonts styles/assets from `fonts.googleapis.com`
and `fonts.gstatic.com`.

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
publishable key (`SUPABASE_PUBLISHABLE_KEY`, with a temporary
`SUPABASE_ANON_KEY` fallback), an SPA fallback for `/auth/callback`, and
matching Supabase Auth allowed redirect URLs and email templates. No backend
service is required for SPA authentication; billing uses the existing Supabase
Edge Functions when explicitly enabled. Migration is limited to preserving the
current browser session and callback contract; changing storage strategy or
PKCE behavior would require explicit sign-in, refresh, logout, and recovery
migration handling.

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

Both Editor and Website production Vite builds emit a Cloudflare Pages
`_headers` file with `Content-Security-Policy-Report-Only`. It is generated
from each build's public `SUPABASE_URL` plus that app's reviewed dependencies;
it never emits an enforcing `Content-Security-Policy` header. The Editor policy
allows the fixed PostHog host and local agent loopback ports. The Website
policy allows its GitHub release API, Umami and Tally hosts, YouTube embed, and
Google Fonts. Supabase HTTPS and corresponding WebSocket origins are derived
from the configured Supabase URL. No general `wss:` or third-party wildcard is
used.

Both builds also emit `Referrer-Policy: no-referrer`, so same-origin asset
requests do not carry authentication callback query parameters in their
`Referer`. Website loads Umami and Tally only after the initial route resolves
and skips both scripts on `/auth/auth-success`, where Supabase verification links
temporarily place bearer tokens in the URL fragment before the callback clears
it.

The policies do not include a report collector. Browsers can show violations
in DevTools, but the current deployment does not retain reports server-side.
The policy intentionally has no `unsafe-inline` or `unsafe-eval`. Editor
bootstrap markup, Google Fonts' inline load handler, Website's inline Tally
configuration, and runtime/component style attributes may therefore appear as
Report-Only violations. Unknown paired-agent WebSocket hosts and preview
embedding origins also require review; they are not allowed through broad
source expressions. A violation currently cannot break rendering or auth
callbacks because the policy is Report-Only. Vite development servers do not
serve this Pages header, so inspect the built `_headers` artifact and the actual
preview response before considering enforcement. Enforcement requires reviewing
the violations and the exact supported Editor, Website, preview, callback, and
paired-agent origins, and removing inline code or adding narrowly scoped
hash/nonce support where appropriate.

On the October 14, 2026 PR preview, both Pages responses were HTTP 200 and
returned the Report-Only header without an enforcing CSP. Chromium observed
Editor violations for `style-src-elem` (99), `script-src-elem` (1), and
`script-src-attr` (1), and Website violations for `style-src-elem` (41),
`script-src-elem` (1), and `connect-src` (2). The check counted directives only
and did not retain blocked URLs. These results confirm that Report-Only does
not break the previews; the policy is not ready for enforcement until the
inline-content and Website connection violations are reviewed.

### Analytics privacy

PostHog receives anonymous product analytics only. Browser and Desktop auth do
not call `identify` or send a Supabase user ID, email address, or anonymous
account flag. On auth initialization, any legacy PostHog state marked as
identified is reset; existing anonymous visitor analytics are preserved.
Logout resets analytics identity. The account email displayed in the sidebar
and Profile settings is marked `ph-no-capture`, and the auth callback keeps
pageview and autocapture disabled while PKCE codes or provider errors may be
present in its initial URL. PostHog's initialization callback clears a legacy
identified state before the SDK sends its initial pageview. The maintainer
handoff selected anonymous-only analytics; historical PostHog records are not
deleted by this code change.
