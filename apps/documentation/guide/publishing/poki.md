# Publish to Poki

Poki is a Release workflow destination for a web application directory, such as a Godot web export. Each upload needs a Game ID and version metadata. Pipelab uses the authentication cache created by Poki's browser sign-in flow.

## Configure the destination

1. Add **Poki** as a destination and enter the **Poki project** Game ID.
2. Connect a web application directory artifact and run the Release workflow.

The Poki project is required and checked before execution. The version name and release notes come from the **Version** and **Description** you enter when you ship (the notes fall back to the version when the description is empty). The action stages the artifact in a temporary directory, writes the Poki CLI configuration, and runs the pinned `@poki/cli` upload command. Sign in first with `pipelab settings integrations poki login`. The command prints Poki's browser sign-in link, exchanges the returned sign-in code, and saves the standard Poki CLI login (`poki/auth.json` in your user config directory: `$XDG_CONFIG_HOME` or `~/.config` on Linux and macOS, `%LOCALAPPDATA%` on Windows). Pipelab reads that file in place, so a login made with the official Poki CLI works without any copying; a login saved earlier under Pipelab's third-party directory is still honoured.

### Multiple Poki accounts

To publish to more than one Poki account, create a **Poki Account** Connection and give it a name such as `studio`. It stores only that name, never a token. Run `pipelab settings integrations poki login studio` once per account; Pipelab saves each login in its own managed directory (`poki-accounts/<name>` under its third-party directory) and runs the Poki CLI against it for workflows that select that Connection. A destination with no Poki Account Connection keeps using the standard login described above. If the named account has no saved login, the step stops before uploading and prints the command to run. On a server without a browser, open the printed link on another device and paste the final URL from that browser into the waiting terminal command. The command only signs in; it does not upload a build. Poki authentication is account-wide, so this command does not need a Game ID. If a workflow has no cached login, it stops before uploading and prints the sign-in command. CLI, network, authentication, and upload errors appear in step logs. The action declares no output variables; the Release workflow records delivery metadata.

The official Poki CLI supports these upload commands:

```sh
npx @poki/cli init --game <game-id> --build-dir dist
npx @poki/cli upload --name "<version>" --notes "<release notes>"
```

Pipelab's sign-in command completes the browser authentication before any workflow upload. Once the CLI has cached the login, workflow uploads can run without opening a browser while the cached session remains valid.

## Minimal destination values

```text
project: <Poki Game ID>
```

At Ship time: Version `1.0.0`, Description `Initial web build`.

Create and configure the game in the Poki Developer Portal first. The game ID must correspond to that project.
