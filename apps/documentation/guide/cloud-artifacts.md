# Pipelab Cloud artifacts

The current Release workflow editor does not expose a Cloud destination or an
upload setting. You cannot start an artifact upload from the workflow editor
in this build. The run detail page can show a Cloud download button when a run
already contains hosted artifact metadata; a signed-in Pipelab account is
required to retrieve that file.

Cloud project and pipeline storage is unavailable in the current build. The
Cloud Save benefit and project-storage UI are not wired to working create,
load, or save flows. Artifact transfer is a separate service and is described
below only for runs that already contain hosted artifact metadata.

## Current transfer limits

These limits describe the transfer service used by the current implementation.
They do not imply that the Release editor currently provides an upload flow.

- Supported artifact output identifiers are `electron.windows`,
  `electron.linux`, `electron.macos.arm64`, `tauri.windows`, `tauri.linux`,
  `tauri.macos.arm64`, and `web.html5`.
- A file is uploaded as-is. A directory is first packaged as a ZIP file.
- Production storage accepts uploads up to 5 TiB, using multipart upload above
  5 GiB. Local development storage supports single-part uploads up to 5 GiB.
- Upload URLs expire after 15 minutes. Download URLs expire after 60 seconds.
- Artifacts have a seven-day expiry. The newest upload for an account and
  output type is pinned; a later upload unpins the previous artifact, and
  scheduled cleanup removes it once its expiry has passed.

Transfer requires a signed-in, non-anonymous Pipelab account. Hosted downloads
are available only while the artifact remains pinned or has not expired.

For contributor context about the Worker and client boundary, see
[Contributor architecture](/contributing/architecture).
