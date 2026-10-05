# Publish to Steam

Steam is a Release workflow destination for desktop application directories targeting Windows, Linux, or macOS. The upload runner currently supports an **x64 Linux host**; run the workflow there. The accepted artifact target list does not mean uploads can run from every OS.

## Configure the destination

1. Add a Steam account connection in Pipelab with the Steam account name. Pipelab uses it to select the matching SteamCMD login cache.
2. Add **Steam** as a destination and select that connection.
3. Enter the Steam **App ID**.
4. For each enabled deployment slot, enter its required **Depot ID**. The optional destination field **Build description** labels the build.
5. Connect the compatible desktop application artifact and run the Release workflow.

The workflow uploads through SteamCMD. Pipelab ensures the upload tool is available and tries the selected account's saved SteamCMD login without passing a password. SteamCMD keeps its login cache in its `config/config.vdf`; Pipelab preserves the SteamCMD directory between runs. Invalid or empty App ID/Depot ID values fail validation, and host checks reject unsupported upload hosts. The upload action returns delivery metadata to the workflow; do not expect a user-facing task output variable.

## Authenticate SteamCMD

The first workflow run requires SteamCMD to have a cached login for the selected account. If the cache is missing, expired, or rejected, the run log shows a complete command using the absolute SteamCMD path managed by Pipelab. Run that command in a terminal. SteamCMD will prompt there for any required password or Steam Guard verification, save its login cache, and then you can retry the workflow.

The manual command uses the same SteamCMD installation and cache as the workflow. It contains the selected account name, but never the account password. SteamCMD may ask you to authenticate again if its cache is revoked or expires. See Valve's [SteamPipe CI/CD guidance](https://partner.steamgames.com/doc/sdk/uploading) for details about preserving SteamCMD's `config/config.vdf` between runs.

## Minimal destination values

```text
account: <connected Steam account>
appId: <Steam App ID>
slot.depotId: <Depot ID for this slot>
```

Use IDs from the matching Steamworks application and depot. A connected account and a valid Steamworks configuration are prerequisites; Pipelab does not create the app or depot. This integration page covers build delivery only; older Construct and in-game Rich Presence instructions are not part of the current Steam provider.
