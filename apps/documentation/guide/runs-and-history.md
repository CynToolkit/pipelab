# Review workflow runs and results

Release workflow history is available from the workflow's **Runs** tab. Open a
run to inspect its summary, task steps, logs, produced artifacts, and delivery
results.

The workflow's **Artifacts** tab collects artifact records across its runs for
discovery. It links each artifact to the originating run; the run detail page
continues to show artifacts alongside the steps and delivery results that
produced them.

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
the workflow. Failed run details summarize common authentication, permission,
connection, missing-file or tool, and disk-space failures when the error message
provides enough information. The summary identifies the failed step and
destination when available, shows how many steps succeeded and how many
artifacts were produced, and suggests a next action. Use **View step logs** to
jump to that step's output. Expand **Technical details** to inspect the provider's
original error and error code.

Artifacts remain available from the **Artifacts** tab, including when a later
delivery step fails. Pipelab does not show a user-facing retry action in the run
detail screen; after addressing the cause, start a new workflow run.

To inspect a workflow plan without running provider tasks, use
[`pipelab workflow run <id-or-name> --dry-run`](/cli/reference#run-a-saved-release-workflow).
