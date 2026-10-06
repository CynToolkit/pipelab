# @pipelab/shared

Shared models, types, and utility functions used by both the frontend and backend of Pipelab.

Built-in providers use `ProviderDefinition` from `@pipelab/shared` to combine
renderer-safe identity and integration metadata, Release source/producer/
destination contributions, and optional native Workflow task factories.
`RendererProviderMetadata` exposes the renderer-facing part without the task
factory registry. Task factories are typed against a host-provided service
bundle, so provider packages do not depend on `@pipelab/core-node`.
`createProviderDefinition` checks this contract while preserving the concrete
definition type, including required task factories when they are supplied.
