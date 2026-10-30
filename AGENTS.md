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

## Verification — shipping first

The goal is to ship correct, working changes. Verification must be
proportional to risk and provide useful confidence, not become a repeated
activity that delays delivery.

### During implementation

- Complete a coherent implementation batch before routine validation. Use a
  quick, focused check earlier only to resolve a specific uncertainty.
- Plan one deliberate, targeted verification pass near completion rather than
  running tests, typechecks, lint, or builds after every edit.
- Never repeat a successful check when the relevant code and inputs have not
  changed. After a fix, rerun the failed check and other checks actually
  affected by that fix, not the entire previous sequence.
- Prefer code inspection and existing tests over adding tests for incidental
  implementation details. Add or update focused tests for meaningful new
  behavior or regressions when they improve confidence.

### Choose checks by risk

- **Low risk:** Documentation, copy, isolated styling, or nonfunctional edits.
  Inspect the diff and relevant output when useful; application tests,
  typechecks, and builds are not required without a concrete reason.
- **Normal risk:** UI behavior, business logic, API/configuration changes, and
  bug fixes. Run the most relevant focused tests; typecheck affected packages
  when types or contracts may be affected. Use a targeted browser check when
  interaction or visual behavior cannot be assessed adequately otherwise.
- **High risk:** Authentication, data integrity, migrations, workflow or
  provider execution, plugin/runtime integration, cross-package contracts,
  and release behavior. Run appropriate targeted integration or migration
  tests plus the affected typechecks/builds. Broaden coverage only for
  material failure modes that focused checks cannot cover.

Prefer package scripts and affected workspaces to repository-wide commands.
Reserve full suites, lint, typechecks, and builds for CI and changes whose
scope genuinely requires them (such as release or repository-wide changes).
Do not manually duplicate CI coverage without a concrete reason. A failing
relevant check is not optional; investigate and fix regressions introduced
by the change. Report unrelated or unavailable checks without disguising
them as passing.

**Stopping rule:** Once acceptance criteria are met and the selected
risk-appropriate checks pass, stop validating and deliver for review. Do not
add another round of tests, a full build, or a browser tour merely for
reassurance. Reviewers should inspect the diff, requirements, and available
evidence rather than reflexively repeating the implementer's checks.

### Test boundaries

Integration, workflow, plugin, runtime, and release execution tests belong in
the CLI host (`apps/cli/tests/e2e`) using the existing test utilities. Keep
Electron coverage to the single minimal startup smoke, which is manual-only
and disabled from CI; it is not a feature-test harness. Planner/compiler
integration tests that must not execute providers should use
`workflow run --dry-run`. UI behavior belongs in UI tests. Prefer fake or
mocked provider boundaries when a third-party service is not the subject of
the test.

Tests must use isolated temporary fixtures and clean them up through the test
runner's teardown hooks. For one-off manual testing, app runs, or recordings
that create persisted history, artifacts, or other app-managed data, identify
the data created by that run and remove it after verification (including when
the run fails). Do not leave disposable test or recording data for normal
retention policies to clean up later. Keep cleanup scoped to data created for
the current task; do not remove pre-existing or user data, and do not disable
or change normal app retention behavior just to hide test output. For one-off
CLI workflow checks, use `--skip-persistence` when retaining the run's
artifacts is unnecessary; run history, outputs, and run-scoped caches then use
temporary storage that is removed when the run ends.

Record what was actually checked, relevant omissions, and remaining risks.
Never claim checks passed unless they ran successfully.

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
- Supabase and Polar validation: use this repository's local Supabase project and
  Polar sandbox for development, integration tests, and acceptance whenever
  these services are needed. Do not point tests at production. Use a hosted
  Supabase project only when a task explicitly requires it and names or
  authorizes the exact project. Keep Polar credentials server-side, and do not
  create purchases or change subscriptions without explicit approval.
- Changesets: include only packages affected by the user-visible change and
  describe the release impact plainly.

## Documentation

Documentation is part of the product and must stay synchronized with the code.

For every code change, explicitly review whether the documentation is affected.
If a change modifies user-visible behavior, workflows, commands, configuration,
APIs, integrations, plugin behavior, installation steps, deployment behavior,
supported platforms, or other documented functionality, update the relevant
documentation in the same change. Do not postpone documentation updates to a
later task.

If a code change does not require a documentation change, explicitly verify
that the existing documentation remains accurate. The source of truth for
current product documentation is `apps/documentation`.

Documentation must describe the behavior of the branch being modified. When
working on `develop`, do not copy behavior from `main` unless it is still valid
on `develop`.

When adding a feature:

- identify where it belongs in the documentation;
- add or update the relevant guide or reference page;
- add navigation or sidebar entries when necessary;
- include verified examples where useful;
- update screenshots only when they materially help explain the feature.

Before completing a user-facing code change, run the appropriate documentation
build or validation when documentation was modified.

This policy applies to both human contributors and coding agents.

## Safety

Do not run destructive Git, release, database, or credential commands without
confirming the exact target and scope. Never expose secrets in logs, commits,
or documentation. Preserve unrelated work in a dirty worktree. Before a
release, migration, deletion, or credential rotation, verify the current
branch, repository status, target identifiers, and rollback path.
