# Troubleshoot Pipelab

Use the recovery steps that match the screen or command that failed. If an
issue comes from a provider, include its name and the relevant log excerpt when
you ask for help. Remove credentials and private paths first.

## Desktop startup {#desktop-startup}

The desktop app starts or connects to a local CLI server before the dashboard
loads. If the app stays on **Connecting** or shows **Disconnected**:

1. Use the retry action on the screen.
2. If you started the UI for development, confirm both the UI dev server and
   CLI backend are running; the desktop package starts these for you.
3. If startup data fails to load, retry after the connection is restored.
4. If packaged desktop startup reports a CLI/server failure, restart the app
   and collect the displayed error for diagnosis.

## Release workflow planning

- **Needs attention:** Open the issue detail on the source, build, destination,
  or deployment slot that reports it. Check its required provider fields and
  selected artifact compatibility.
- **Build target is unavailable:** Availability depends on the selected
  producer and current host platform/architecture. Use only targets listed by
  that producer.
- **Dry-run fails:** `pipelab workflow run <id-or-name> --dry-run` still loads
  providers and validates the saved workflow. A dry-run does not execute
  deployment tasks, but it can report missing settings or invalid references.

## CLI and provider failures

- `pipelab workflow run` requires a saved workflow. Use an ID or a unique name;
  use `--dry-run` to inspect planning issues before execution.
- Provider errors often indicate missing account connections, external tools,
  project settings, or host limitations. Follow the provider page for the
  current requirements.

See the [CLI reference](/cli/reference), [provider catalog](/guide/integrations/),
and [Runs and history](/guide/runs-and-history) for command and execution
details.
