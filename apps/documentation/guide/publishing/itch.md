# Publish to itch.io

Itch.io is a Release workflow destination. It accepts application or files artifacts stored as a directory or archive. An upload sends the selected artifact to an itch project and channel through Butler.

## Configure the destination

1. Create an Itch account connection with its API key.
2. Add **Itch.io** as a destination and select that connection.
3. Set **Project** to the target project name.
4. For every enabled deployment slot, set its required **Channel** (for example, `windows`, `mac`, or `web`, according to the channels you configured on itch.io).
5. Connect the artifact and run the Release workflow.

Pipelab downloads and manages the Butler CLI for the current host. The upload uses the account username, project, and channel in Butler's `user/project:channel` form, with the API key supplied to Butler as `BUTLER_API_KEY`. Account/profile lookup errors, missing values, unsupported Butler architectures, and Butler upload failures stop the step and appear in logs. No output variables are declared by the upload action; workflow delivery details identify the destination and slot.

## Minimal destination values

```text
account: <connected Itch account>
project: my-game
slot.channel: html5
```

Use the project and channel names from your itch.io setup. The example values are illustrative; Pipelab does not create the project or channel.
