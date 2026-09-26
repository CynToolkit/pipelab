# NVPatch

The **Patch binary** pipeline action uses Topten.nvpatch to add the `NvOptimusEnablement` and `AmdPowerXpressRequestHighPerformance` exports used by some systems to select a discrete GPU for an executable.

The action takes one required `input` path to a binary file and declares no outputs. It patches that binary in place. Pipelab checks for `nvpatch` in its third-party tools directory and installs it there with `dotnet tool install` when it is missing; a global manual tool install is not required.

## Requirements and errors

Install .NET 8 or later and make the `dotnet` command available on `PATH`. A missing runtime or version below 8 fails before patching. A missing input binary, tool installation failure, or patch command error also fails the task. The plugin contains platform-specific handling, but does not establish broad platform support guarantees.

## Minimal input

```text
input: /work/game/Game.exe
```

The path is the file that will be patched. Keep a backup if you need the unmodified binary afterward.
