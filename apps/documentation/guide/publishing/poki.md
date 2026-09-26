# Publish to Poki

Poki is a Release workflow destination for a web application directory, such as a Godot web export. Each upload needs a Game ID and version metadata. The destination currently does not use the separate **Poki Developer Profile** connection fields.

## Configure the destination

1. Add **Poki** as a destination.
2. Enter the **Poki project** Game ID, **Version name**, and **Release notes**.
3. Connect a web application directory artifact and run the Release workflow.

All three destination fields are required and checked before execution. The action stages the artifact in a temporary directory, writes the Poki CLI configuration, and runs the pinned `@poki/cli` upload command. It looks for `thirdparty/poki/auth.json` (or `thirdparty/Poki/auth.json`) in Pipelab's user-data area; without this file, it may request interactive login, which can fail or hang in a headless run. The destination exposes no credential field, and the separate Developer Profile connection does not supply CLI authentication. CLI, network, authentication, and upload errors appear in step logs. The action declares no output variables; the Release workflow records delivery metadata.

## Minimal destination values

```text
project: <Poki Game ID>
name: 1.0.0
notes: Initial web build
```

Create and configure the game in the Poki Developer Portal first. The game ID, version label, and notes must correspond to that project. The bundled desktop app does not provide a separate setting to enter Poki CLI credentials for this destination.
