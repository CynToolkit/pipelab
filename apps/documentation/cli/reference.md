# CLI reference

The CLI executes saved **Release workflows** from Pipelab's user-data store
with `pipelab workflow run <id-or-name>`.

While it runs, the CLI shows readable operation names such as “Build desktop app (Linux x64)” and “Upload to Steam.”

A Release workflow can build or deliver a user's game; it does not publish a
Pipelab desktop or npm release. See [Release workflows](/guide/release-workflows)
and [Release Pipelab](/contributing/releases).

Run `pipelab --help` or a command's `--help` for help. Local CLI help confirms
the registered command list; the details below follow the command registrations
and handlers.

The root command accepts `--version` and `--help`; calling `pipelab` without a subcommand prints help. The npm package also installs `plab` as an executable alias.

## Commands

### Server

```text
pipelab serve
```

Starts the standalone HTTP/WebSocket server used by the UI and provider handlers.

| Option                      | Default                      | Behavior                                                                                                            |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `-p, --port <port>`         | `33753`                      | Port to listen on.                                                                                                  |
| `--host <host>`             | `127.0.0.1`                  | Interface to bind.                                                                                                  |
| `--auth-token <token>`      | `PIPELAB_AUTH_TOKEN`, if set | Bearer token for non-loopback access.                                                                               |
| `--allowed-origin <origin>` | —                            | Adds one browser origin to the built-in localhost development origins. This option is not registered as repeatable. |
| `--user-data <path>`        | Platform default             | Use a custom user-data directory.                                                                                   |

The default is loopback-only. In production, non-loopback access requires a token; development has separate origin checks. Development requests are redirected to the UI dev server; production serves bundled UI assets, which must be present in the CLI bundle. See [architecture](/guide/architecture) for the desktop/server boundary.

### Run a saved Release workflow

```text
pipelab workflow run <id-or-name>
```

Loads a saved Release workflow by ID or unique name and executes its compiled task workflow. The `workflows` group alias is accepted.

| Option                | Behavior                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--user-data <path>`  | Use a custom user-data directory.                                                                                                                             |
| `-o, --output <path>` | Write the run result JSON; with `--dry-run`, write the prepared config and plan instead.                                                                      |
| `--dry-run`           | Validate and prepare the workflow without executing deployment tasks.                                                                                         |
| `--fail-on-error`     | Exit nonzero if the workflow completes with errors.                                                                                                           |
| `-v, --verbose`       | Registered with the description “Show workflow logs after completion”; the current command handler does not read this option, so it has no additional effect. |

Examples exercised by the CLI E2E suite:

```sh
pipelab workflow list --user-data <user-data-path>
pipelab workflow run "Command workflow" --user-data <user-data-path> --dry-run
pipelab workflow run <workflow-id> --user-data <user-data-path> --dry-run --output plan.json
```

These forms are exercised by the release workflow E2E suite: listing by the `list` alias, resolving a saved workflow by name, and writing a dry-run plan to a result path. Workflow execution and the low-level workflow object are described in [Workflow references](/guide/workflow-references) and the [workflow runtime reference](/reference/workflow-runtime).

### Manage workflows

```text
pipelab workflow ls
pipelab workflow rm <id>
```

`workflow ls` (alias `list`) prints saved workflow names and IDs, source provider, destination providers, and last-modified value. `workflow rm` also accepts `remove` and `delete`; it requires `-f, --force`. Both commands accept `--user-data <path>`. The parent group accepts `workflows` as an alias.

### Build history and maintenance

```text
pipelab history [project-id]
pipelab usage
pipelab purge [project-id]
```

- `history <project-id>` prints workflow run history for one project. `--limit <number>` defaults to `10`; `--user-data <path>` selects a different store. Use `--get <build-id>` to print one JSON history record, optionally scoped by project ID. Without either a project ID or `--get`, the command exits with an error. The current implementation's ordering should not be read as a guaranteed newest-first listing.
- `usage` reports workflow-history entry count, projects with history, history size, oldest/newest timestamps, user-data path, and cache path. It is not a general disk-usage report. It accepts `--user-data <path>`.
- `purge [project-id]` requires `-f, --force`. It removes workflow history and associated recorded artifacts/cache data for that project, or all recognized build history when no ID is supplied. It accepts `--user-data <path>`.

### Setup wizard

```text
pipelab setup
```

Accepts `--user-data <path>`. The interactive wizard writes the selected theme and locale. Its authentication and integration stages are currently simulated: selecting them does not store credentials or configure PATH, shell completion, or telemetry. Do not use this command as a substitute for cloud authentication setup.

## User-data defaults

Commands that accept `--user-data` otherwise use the platform-specific directory described in [CLI installation](/cli/installation). Development uses the `app-dev` suffix; a beta CLI build uses `app-beta`.
