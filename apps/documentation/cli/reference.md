# CLI reference

The CLI executes saved **Release workflows** from Pipelab's user-data store or
portable Release Workflow JSON files with `pipelab workflow run <id-or-name|file>`.

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

The standalone CLI default is loopback-only on `127.0.0.1:33753`. Desktop starts its own server on port `0` (letting the OS choose a port) and authenticates that process and launch session before loading the UI. This internal Desktop port does not change the standalone CLI default. In production, non-loopback access requires a token; development has separate origin checks. Development requests are redirected to the UI dev server; production serves bundled UI assets, which must be present in the CLI bundle. See [architecture](/guide/architecture) for the desktop/server boundary.

### Run a Release workflow

```text
pipelab workflow run <id-or-name|file>
```

Loads a saved workflow by ID or unique name, or reads a portable JSON file such
as `./release.json`, then executes its compiled task workflow. File workflows
do not need a saved workflow index entry or a local Connection registry.
Relative provider file and directory settings in a JSON workflow resolve from
the workflow file's directory. The `workflows` group alias is accepted.

In an interactive terminal, running workflow tasks show a live elapsed timer
and the one live output line below the running task or active phase. After the
workflow steps finish, a final **Finalizing** row shows elapsed time while
the run record is written. The workflow name shows total elapsed time, and the
completed task list keeps each task's final duration visible. Non-interactive
output shows the final durations without repeated timer updates. Use `--verbose` to print the
full captured task logs after the run; without it, the interactive view keeps
one live output line below the running task or active phase. The workflow name also shows the wall-clock
time for the full run; this is elapsed time, not a sum of the individual task
durations.

Workflow tasks are grouped under **Source**, **Build**, and **Destinations**.
Source and build tasks are nested under their provider or profile. Destinations
with a single default slot appear directly under **Destinations**; destinations
with named or multiple slots group uploads under the destination and slot names.

| Option                             | Behavior                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--user-data <path>`               | Use a custom user-data directory.                                                                                                                            |
| `-o, --output <path>`              | Write the run result JSON; with `--dry-run`, write the prepared config and plan instead.                                                                     |
| `--dry-run`                        | Validate and prepare the workflow without executing deployment tasks.                                                                                        |
| `--fail-on-error`                  | Exit nonzero if the workflow completes with errors.                                                                                                          |
| `-v, --verbose`                    | Print all captured workflow task logs after the run completes. The interactive view still shows one live output line under the running task or active phase. |
| `--connection <alias.field=VALUE>` | Override one provider Connection field for this run. Repeat the option for additional fields.                                                                |

Use the workflow alias and the field key defined by its provider. `env:NAME`
reads `NAME` from the environment of the client that starts the run;
`literal:VALUE` forces an exact literal, and unprefixed values are literals.
The parser splits at the first `=` and preserves the rest of the value. Literal
values can appear in shell history and process listings, so the CLI warns when
one is supplied.

```sh
pipelab workflow run release-id \
  --connection steam-release.username=env:STEAM_USERNAME
```

Steam's Connection schema contains the account username. SteamCMD uses its
cached login for that account; it prompts for password and Steam Guard only
when the cache needs authentication. See [Publish to Steam](/guide/publishing/steam#authenticate-steamcmd).

CLI workflows use aliases stored in the workflow and do not need a local
Connection registry. Connection overrides are run-scoped and do not change the
saved workflow or any Desktop binding.

Examples exercised by the CLI E2E suite:

```sh
pipelab workflow list --user-data <user-data-path>
pipelab workflow run "Command workflow" --user-data <user-data-path> --dry-run
pipelab workflow run <workflow-id> --user-data <user-data-path> --dry-run --output plan.json
pipelab workflow run <workflow-id> --user-data <user-data-path>
pipelab workflow run ./release.json --connection itch-production.apiKey=env:WORK_ITCH_KEY
```

See the [Release workflow guide](/guide/release-workflows) for a GitHub
Actions example that passes a secret through an environment variable.

These forms are exercised by the release workflow E2E suite: listing by the `list` alias, resolving a saved workflow by name, writing a dry-run plan, and submitting a JSON workflow with a run-scoped Connection mapping. Workflow execution and the low-level workflow object are described in [Workflow references](/guide/workflow-references) and the [workflow runtime reference](/reference/workflow-runtime).

Enabled Build Profile hooks run as part of a normal workflow execution. A
dry-run can inspect their compiled command steps without executing them. See
the [Release workflow guide](/guide/release-workflows#workflow-sections) for
the staged working directory and run-scoped `PIPELAB_` environment variables.

### Manage workflows

```text
pipelab workflow ls
pipelab workflow rm <id>
```

`workflow ls` (alias `list`) prints saved workflow names and IDs, source provider, destination providers, and last-modified value. `workflow rm` also accepts `remove` and `delete`; it requires `-f, --force`. Both commands accept `--user-data <path>`. The parent group accepts `workflows` as an alias.

### Pipelab Cloud sign-in

```text
pipelab settings cloud login
pipelab settings cloud status
pipelab settings cloud logout
```

`login` asks for the Pipelab account email and password in an interactive
terminal. Supabase stores the local session in the operating system credential
store. `status` shows the signed-in account without exposing its session token.
`logout` removes the session from this device only. Pass `--user-data <path>`
to use a separate local account context. CI uploads and token authentication
are deferred.

### Build history and maintenance

```text
pipelab history [project-id]
pipelab usage
pipelab purge [project-id]
```

- `history <project-id>` prints workflow run history for one project. `--limit <number>` defaults to `10`; `--user-data <path>` selects a different store. Use `--get <build-id>` to print one JSON history record, optionally scoped by project ID. Without either a project ID or `--get`, the command exits with an error. The current implementation's ordering should not be read as a guaranteed newest-first listing.
- `usage` reports workflow-history entry count, projects with history, history size, oldest/newest timestamps, user-data path, and cache path. It is not a general disk-usage report. It accepts `--user-data <path>`.
- `purge [project-id]` requires `-f, --force`. It removes workflow history and run-associated Pipelab-managed workspace, staging, and canonical cache folders for that project, or for all projects when no ID is supplied. Unrelated artifact and cache content is retained. It accepts `--user-data <path>`.

### Setup wizard

```text
pipelab setup
```

Accepts `--user-data <path>`. The interactive wizard writes the selected theme and locale. Its authentication and integration stages are currently simulated: selecting them does not store credentials or configure PATH, shell completion, or telemetry. Do not use this command as a substitute for cloud authentication setup.

## User-data defaults

Commands that accept `--user-data` otherwise use the platform-specific directory described in [CLI installation](/cli/installation). Development uses the `app-dev` suffix; a beta CLI build uses `app-beta`.
