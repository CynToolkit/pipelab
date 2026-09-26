# What is Pipelab?

Pipelab is a desktop application and command-line tool for preparing and
shipping game projects. It brings project files, build actions, and delivery
steps into workflows you can configure and run.

## Two ways to work

**Pipelines** use a graph editor with plugin-provided tasks. The graph runs in
its saved order, and you can inspect task logs and outputs. Use a pipeline when
you want to automate a sequence of local actions.

**Release workflows** start from a project or build source, select one or more
build profiles and targets, and route produced artifacts to destinations. Use
one when you want to prepare and deliver a release through supported providers.
Their run history is shown separately from legacy pipeline Build History.

These are related parts of Pipelab, but they do not share the same editor or
execution model. See [pipelines](/guide/pipelines) and
[Release workflows](/guide/release-workflows) for the details.

## Providers and tasks

Pipelab includes registered providers for selected project sources, build
tools, publishing destinations, and local actions. Availability depends on the
provider and the host machine. The [provider catalog](/guide/integrations/)
lists the current set and links to each provider's inputs, prerequisites, and
limits.

Provider entries reflect the sources, builds, destinations, and tasks available
in the current app.

## Where work runs

The desktop application starts or connects to a local Pipelab engine. The
editor sends work to that engine; some actions also use the Electron shell for
native dialogs or opening files. The [architecture guide](/guide/architecture)
shows this boundary and explains the difference between pipeline and Release
workflow runs.
