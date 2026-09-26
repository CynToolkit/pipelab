# Publish to Steam

Steam is a Release workflow destination for desktop application directories targeting Windows, Linux, or macOS. The upload runner currently supports an **x64 Linux host**; run the workflow there. The accepted artifact target list does not mean uploads can run from every OS.

## Configure the destination

1. Add a Steam account connection in Pipelab with the Steam username and password fields.
2. Add **Steam** as a destination and select that connection.
3. Enter the Steam **App ID**.
4. For each enabled deployment slot, enter its required **Depot ID**. The optional destination field **Build description** labels the build.
5. Connect the compatible desktop application artifact and run the Release workflow.

The workflow uploads through SteamCMD. Pipelab ensures the upload tool is available. Invalid or empty App ID/Depot ID values fail validation; host checks reject unsupported upload hosts, and SteamCMD authentication or upload failures are shown in run logs. The upload action returns delivery metadata to the workflow; do not expect a user-facing task output variable.

## Minimal destination values

```text
account: <connected Steam account>
appId: <Steam App ID>
slot.depotId: <Depot ID for this slot>
```

Use IDs from the matching Steamworks application and depot. A connected account and a valid Steamworks configuration are prerequisites; Pipelab does not create the app or depot. This integration page covers build delivery only; older Construct and in-game Rich Presence instructions are not part of the current Steam plugin.
