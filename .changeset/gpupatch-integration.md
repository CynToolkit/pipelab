---
"@pipelab/app": minor
---

feat(plugin-electron): add "Patch executable" option to force high-performance GPU on Windows

Adds a "Patch executable" checkbox to the Electron plugin. When enabled, the packaged
Windows executable is patched with [gpupatch](https://github.com/CynToolkit/gpupatch)
to inject `NvOptimusEnablement` and `AmdPowerXpressRequestHighPerformance`, forcing the
app to use the discrete GPU on laptops. The gpupatch CLI is downloaded on first use and
the option is surfaced as Windows-only in the UI.
