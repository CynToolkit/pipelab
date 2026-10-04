# @pipelab/core-node

The backend execution engine for Pipelab.

## Responsibilities

- **Workflow Execution**: Compiles and runs saved Release workflows.
- **WebSocket Server**: Real-time communication between UI and backend.
- **Environment Management**: Ensures required runtimes (like Node.js) are available.
- **System Integration**: File system utilities, terminal emulation (PTY), and build history management.

Native workflow tasks receive the `PipelabPluginServices` bundle through their
`WorkflowTask` context. It exposes `PipelabContext`, the run's ensured Node and
pnpm executables, and its workflow cache directory. Managed package, cache,
third-party, connection, and temporary paths are resolved through
`PipelabContext`. Plugin task registries resolve directly to native
`WorkflowTask` implementations.
