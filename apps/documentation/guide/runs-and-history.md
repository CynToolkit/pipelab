# Review workflow runs and results

Release workflow history is available from the workflow's **Runs** tab. Open a
run to inspect its summary, task steps, logs, produced artifacts, and delivery
results.

## Run list

The Runs page lists saved execution records for the selected workflow. It has
loading, empty, and error states. If a new run is still being persisted, the
detail page waits briefly and retries the lookup before showing an error.

## Run details

The run detail page shows:

- overall status and summary;
- each workflow step and its status;
- step logs, which can be filtered by step;
- artifacts produced by build steps;
- destination delivery results.

When a run is still eligible for cancellation, the page can send a cancel
request. Local artifact opening uses the desktop shell. Hosted artifacts can be
downloaded through the browser when the run contains a supported cloud artifact.

If a step fails, review its log and the provider's setup page before rerunning
the workflow. Pipelab does not show a user-facing retry action in the run detail
screen.

## Pipeline Build History is separate

The graph editor also has a legacy **Build History** dialog. It belongs to
pipeline runs and is distinct from the Release workflow Runs tab. Use the
workflow's Runs tab for source/build/destination executions.

To inspect a workflow plan without running provider tasks, use
[`pipelab workflow run <id-or-name> --dry-run`](/cli/reference#run-a-saved-release-workflow).

Pipeline history is recorded locally by default, unless disabled by the host
environment. The legacy pipeline **Build History** dialog is a premium
feature and appears only for accounts with the required benefit. Release
workflow history is available separately in its **Runs** tab.
