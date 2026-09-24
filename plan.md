# CI and release architecture

## Continuous integration

Every pull request and push to `develop` or `main` runs the full repository lint, typecheck, test, and build tasks on Ubuntu. The build lane also runs the Linux desktop package smoke. CI has no custom change detection; Turbo caching is the only work reuse mechanism.

Website and editor deployments remain independent Cloudflare workflows with path filters.

## Desktop releases

A `@pipelab/app@<version>` tag starts four native builds: Linux x64, Windows x64, macOS Intel x64, and macOS ARM64. macOS artifacts are checked for the expected architecture and valid signing. A final job publishes the artifacts as a GitHub Release.

## CLI releases

A `@pipelab/cli@<version>` tag builds the bundled CLI, verifies that the generated `apps/cli/dist` npm package contains the executable, UI, and assets, then publishes that package to npm.

## Workflow boundaries

Release triggers are explicit tags. There is no CI Gate, workflow metadata, cross-workflow artifact handoff, source-version-diff inference, or generic cross-platform test matrix. Website/editor deployment, desktop release, and CLI release remain separate from normal CI.
