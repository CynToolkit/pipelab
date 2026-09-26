# Install and configure the CLI

Pipelab publishes its standalone command-line package as `@pipelab/cli` on npm. The package provides both `pipelab` and `plab` executable names. A release job builds a bundled package, checks that its manifest and UI/assets are present, and publishes it with public access.

```sh
npm install --global @pipelab/cli
pipelab --help
```

The release workflow uses Node.js 24.15.0 to build the package. The published manifest does not declare a minimum Node.js version, so this repository does not establish a separate end-user version requirement. The CLI is a Node package, rather than a platform-specific executable.

## User data

By default, the CLI stores configuration, projects, cache, and history under a Pipelab user-data directory:

| Platform | Base path |
| --- | --- |
| Windows | `%APPDATA%\@pipelab\app` (or `~/AppData/Roaming/@pipelab/app` if `APPDATA` is unset) |
| macOS | `~/Library/Application Support/@pipelab/app` |
| Linux and other platforms | `$XDG_CONFIG_HOME/@pipelab/app`, or `~/.config/@pipelab/app` if `XDG_CONFIG_HOME` is unset |

Beta builds use `app-beta` in place of `app`; development runs use `app-dev`. Commands that accept `--user-data <path>` use that path instead. The desktop app has its own channel-specific startup configuration; this table describes the CLI default.

## Cloud configuration

When Supabase configuration is unavailable, startup prints:

```text
Warning: Authentication is currently disabled (Cloud services not configured).
```

The CLI can still run local commands. Authentication and cloud features depend
on the Supabase values included in the build. The artifact client also reads
`PIPELAB_CLOUD_WORKER_URL`, but the current Release editor does not expose an
upload path. See [Cloud artifacts](/guide/cloud-artifacts) for current
availability and limits. `POSTHOG_API_KEY`, when included in a production
build, enables command telemetry.

Use `pipelab --help` for the command list and `pipelab <command> --help` for a command's options. See the [CLI reference](/cli/reference) for command behavior and the distinction between graph pipeline runs and Release workflow runs.

## Development install

To work on the CLI from a source checkout, use the repository's pinned Node.js 24 and pnpm 10.33.0 versions, then install workspace dependencies with `pnpm install`. Start the server with `pnpm --filter @pipelab/cli dev`; it runs the CLI in development mode and loads the root `.env` when present. See [Develop Pipelab](/contributing/development) for environment values and workspace commands.
