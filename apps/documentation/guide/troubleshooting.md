# Troubleshoot Pipelab

Use the recovery steps that match the screen or command that failed. If an
issue comes from a provider, include its name and the relevant log excerpt when
you ask for help. Remove credentials and private paths first.

## Desktop startup {#desktop-startup}

The desktop app starts or connects to a local CLI server in the background.
Navigation remains visible while it connects. If the connection notice stays
on **Connecting** or reports that no agent is connected:

1. Use **Reconnect** in the connection notice.
2. If you started the UI for development, confirm both the UI dev server and
   CLI backend are running; the desktop package starts these for you.
3. If a section's data fails to load, use **Retry** in that section after the
   connection is restored. A failure in one section does not block navigation
   or other loaded sections.
4. If packaged desktop startup reports a CLI/server failure, restart the app
   and collect the displayed error for diagnosis.

While disconnected, previously loaded data may remain visible, but editing,
execution, and other agent-dependent actions are disabled. This does not
provide offline workflow editing or execution. A slow account plan check
should affect plan-dependent controls rather than the whole dashboard.

If the sidebar reports **Plan unavailable**, inspect the displayed lookup error
and use **Retry plan check** after restoring the service or connection. An
unavailable lookup does not confirm a free plan; plan-dependent controls remain
disabled until the check succeeds.

If the connection drops while workflow changes are saving, the editor keeps
the unsaved draft and shows a save error. After reconnecting, use **Retry save**
before leaving the editor. Pending requests from the old connection fail;
they are not replayed on the new connection.

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
