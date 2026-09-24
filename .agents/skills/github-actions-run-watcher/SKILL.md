---
name: github-actions-run-watcher
description: Wait for GitHub Actions runs to finish and inspect failures efficiently. Use when CI completion is a prerequisite for continuing work.
---

# GitHub Actions Run Watcher

Use this skill when you need to wait for a GitHub Actions workflow run to finish before continuing.

## Wait for a run

Given a GitHub Actions run ID, prefer:

```bash
gh run watch "$RUN_ID" --exit-status --compact
```

`--exit-status` makes the command fail when the run fails. `--compact` keeps the output concise. Prefer this over repeatedly calling `gh run view`.

If the run succeeds, continue with the next task. If it fails, retrieve only the failed logs:

```bash
gh run view "$RUN_ID" --log-failed
```

Inspect the failure, fix the cause, then rerun the relevant workflow or checks.

## Manual status checks

Use `gh run view` only when intermediate state is needed, multiple runs must be coordinated, custom timeout or backoff behavior is needed, or CI state must be integrated into a larger event loop. For a single status check, keep the output narrow:

```bash
gh run view "$RUN_ID" \
  --json status,conclusion \
  --jq '{status, conclusion}'
```
