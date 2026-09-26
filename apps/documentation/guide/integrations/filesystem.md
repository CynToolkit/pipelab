# Filesystem actions

Filesystem actions operate on paths visible to the machine running the pipeline. They need no account credentials. A path outside the host's readable or writable areas can fail because of normal filesystem permissions.

| Action | Inputs and defaults | Output |
|---|---|---|
| **Zip** (legacy) | Required `folder` and `output` paths | `path`, the archive path |
| **Zip** (v2) | Required `folder`; writes `output.zip` in the task cache by default | `path`, the archive path |
| **Unzip file** | Required `file`; extracts into the task working directory | `output`, the extraction directory |
| **Copy file/folder** | Required `from`, `to`; `recursive`, `overwrite`, and `cleanup` default to `true` | `output`, `input`, `parentDirectory` paths |
| **Remove file/folder** | Required `from`; `recursive` defaults to `true` | None |
| **Run Command** | Required command; `parameters` defaults to `[]`; optional `workingDirectory` defaults to the process current directory; `stopOnError` defaults to `false` | `stdout`, `stderr`, `exitCode`, `duration` |
| **Open path in explorer** | Required `path` | `message` |

The v2 Zip action has no visible `outputPath` field, although its runner accepts one internally; in the task editor, expect the cache `output.zip` default. Unzip's output is the working directory, not a directory chooser. **Run Command** executes the named program with the listed arguments; it does not evaluate a shell command string. If `stopOnError` is enabled, a nonzero exit causes the task to fail. Opening a path depends on the host OS desktop handler, so it may not work in headless execution.

## Minimal example: run a command

```text
command: node
parameters: ["--version"]
workingDirectory: <leave empty>
stopOnError: true
```

The process output and exit code are available as task outputs. The `duration` output is currently set to `0` by the runner. An unavailable executable or process launch error fails the task. The former **Invoke File** label is not the registered action name; use **Run Command**. List files is not currently registered.
