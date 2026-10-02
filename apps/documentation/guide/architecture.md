# How Pipelab runs your work

The desktop app is made from an Electron shell, a Vue UI, and a local Node.js
engine. The shell starts or resolves the CLI server, and the UI connects to the
engine. In production, the server also serves the bundled UI.

![Pipelab desktop, UI, CLI server, and execution paths](../assets/architecture/architecture.svg)

## Request paths

1. The Vue UI sends engine requests over the local WebSocket connection.
2. The Electron preload bridge exposes native operations such as file dialogs
   to the UI through IPC.
3. The Node engine owns plugin execution, file operations, and run history.

The standalone CLI can start the server with `pipelab serve`; its default
address is `127.0.0.1:33753`. Binding beyond loopback in production requires an
authentication token. See the [CLI reference](/cli/reference#server).

## Workflow execution

The Release workflow planner validates sources, producers, destinations,
artifact compatibility, and dependencies before compiling task steps for the
workflow runtime. Ready workflow steps can run concurrently when their
dependencies allow it. The CLI can run a saved workflow with
`pipelab workflow run`.

For implementation ownership, package boundaries, and contribution setup, see
[Contributor architecture](/contributing/architecture).
