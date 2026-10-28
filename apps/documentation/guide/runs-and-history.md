# Review workflow runs and results

Release workflow history is available from the workflow's **Runs** tab. Open a
run to inspect its summary, task steps, logs, produced artifacts, and delivery
results. The dashboard's **Recent executions** and each workflow's Runs tab
read the same Build History records; they do not keep separate run histories.

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
request. While a run is active, its detail page refreshes persisted history so
it remains current after a reload or when opened in another window. Live output
is kept while persisted updates arrive. Local artifact opening uses the desktop shell. Hosted artifacts can be
downloaded through the browser when the run contains a supported cloud artifact.

If a step fails, review its log and the provider's setup page before rerunning
the workflow. Failed run details summarize common authentication, permission,
connection, missing-file or tool, and disk-space failures when the error message
provides enough information. Forbidden responses point to checking destination
account permissions, while local `EACCES` or `EPERM` errors point to checking
permissions for the reported file path. Authentication failures point to
signing in again.
The summary identifies the failed step and
destination when available, shows how many steps succeeded and how many
artifacts were produced, and suggests a next action. Use **View step logs** to
jump to that step's output. Expand **Technical details** to inspect the provider's
original error and error code.

Artifacts remain available from the **Artifacts** tab, including when a later
delivery step fails. For a completed, failed, or cancelled run, choose **Run
again** to open the saved workflow's Ship confirmation. This starts a new full
run, including every enabled step and delivery, so previously successful
destinations may run again. Review the version and destinations before
confirming.

## History retention and cleanup

Pipelab retains run records and Pipelab-managed run artifacts by default; there
is no automatic age-based deletion. In Desktop, open **Settings →
Advanced → Clear all run history** to remove run history and Pipelab-managed
workflow artifacts associated with saved runs for every project. The operation
is confirmed first and is blocked while a workflow is running. It does not
remove source files or output files outside Pipelab's artifact storage.

The CLI also supports `pipelab purge --force` to clear all history, or
`pipelab purge <project-id> --force` to clear one project's history and managed
artifacts. See the [CLI reference](/cli/reference#build-history-and-maintenance)
for details.

To inspect a workflow plan without running provider tasks, use
[`pipelab workflow run <id-or-name> --dry-run`](/cli/reference#run-a-release-workflow).
