# NVPatch
nvpatch is <q cite="https://github.com/toptensoftware/nvpatch?tab=readme-ov-file#nvpatch">A simple command line utitly to patch existing x64 executables to include the export symbols NvOptimusEnablement and AmdPowerXpressRequestHighPerformance as required to enable the discreet GPU on some machines (mainly laptops)</q> — [Github](https://github.com/toptensoftware/nvpatch)

## Pre-requisites

- Install [.NET 5.0](https://dotnet.microsoft.com/fr-fr/download/dotnet/thank-you/sdk-5.0.408-windows-x64-installer)
- Run `dotnet tool install -g Topten.nvpatch` in a terminal

## Patch binary
Use this action to patch a binary file.