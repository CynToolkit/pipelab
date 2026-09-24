# Pipelab agent instructions

This file is the repository-wide source of truth for coding-agent work. More
specific `AGENTS.md` files, if added under a package, may narrow these rules
for that subtree. The task-specific skills under `.agents/skills/` are reusable
procedures, not competing repository policy.

## Repository map

- `apps/`: desktop Electron shell, CLI, UI, documentation, and small app
  projects.
- `packages/`: shared libraries, configuration, migrations, runtime support,
  and test utilities.
- `plugins/`: integrations and workflow plugins. Keep provider-specific logic
  here instead of adding integration branches to generic packages.
- `workers/`: Cloudflare Worker entrypoints and shared worker code.
- `supabase/`: local configuration and database migrations/functions.
- `assets/`: templates and release assets.

Read the nearest package README and package manifest before changing a package.
Respect package `exports`; do not import unsupported workspace subpaths.

## Tooling and commands

The repository uses Node 24, pnpm 10.33.0, and Turborepo. The root scripts
delegate to workspace scripts:

```text
pnpm install
pnpm dev
pnpm dev-remote
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format
pnpm --filter <workspace-name> <script>
```

Use `pnpm --filter @pipelab/cli ...` and `pnpm --filter @pipelab/ui ...` for
focused CLI/UI work. Use the package's own scripts for focused tests,
typechecks, lint, or builds. `turbo.json` is authoritative for task ordering;
do not invent workspace ordering or bypass package scripts without a reason.

Changesets are the release mechanism. Add a changeset when a user-facing
package change needs release tracking, and do not manually edit generated
versions or lockfile entries unless the task requires it.

## Verification

Start with the narrowest relevant check, then broaden it when the change
crosses package or runtime boundaries:

- logic or provider change: focused package tests;
- TypeScript/API/config change: focused tests plus the affected package
  typecheck;
- UI change: focused UI tests and, when relevant, a browser check;
- Supabase migration/function change: migration or function tests plus the
  affected package checks;
- plugin or cross-package change: affected package tests, typechecks, and
  builds as needed;
- release or repository-wide configuration change: the applicable full test,
  lint, typecheck, and build commands.

Do not skip verification categorically, and do not run every expensive check
for an isolated documentation edit. Record any unavailable check and why.

During iteration, prefer fast, focused local checks and rerun them as changes
evolve. Save slower, broad CI pipelines for final verification after local
checks and review are complete, unless earlier CI feedback is needed to resolve
a specific issue.

Integration, workflow, plugin, runtime, and release execution tests belong in
the CLI host (`apps/cli/tests/e2e`) using the existing test utilities. Keep
Electron coverage to the single minimal startup smoke, which is manual-only
and disabled from CI; it is not a feature-test harness. Planner/compiler
integration tests that must not execute providers should use
`workflow run --dry-run`. UI behavior belongs in UI tests. Prefer fake or
mocked provider boundaries when a third-party service is not the subject of
the test.

## TypeScript and code boundaries

Avoid `any` and unjustified casts. Prefer narrowing, schema validation, and
typed boundaries. Keep generic packages independent of integration-specific
details. Do not add speculative abstractions or unrelated cleanup.

## Area-specific guidance

- Plugin changes: preserve the plugin registry and public exports; put
  integration behavior in the owning plugin and add focused tests.
- UI changes: follow existing Vue/PrimeVue patterns, preserve accessible
  states, and verify behavior in `apps/ui` rather than through Electron.
- Supabase changes: inspect the current schema and migration conventions,
  make migrations explicit and reversible where practical, and regenerate
  types only when the schema actually changes.
- Changesets: include only packages affected by the user-visible change and
  describe the release impact plainly.

## Safety

Do not run destructive Git, release, database, or credential commands without
confirming the exact target and scope. Never expose secrets in logs, commits,
or documentation. Preserve unrelated work in a dirty worktree. Before a
release, migration, deletion, or credential rotation, verify the current
branch, repository status, target identifiers, and rollback path.
