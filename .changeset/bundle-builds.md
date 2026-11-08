---
"@pipelab/shared": patch
"@pipelab/core-node": patch
"@pipelab/ui": patch
---

Add multi-input builds and a Bundle build that puts the outputs of several builds, for example the Windows, Linux and macOS builds, into one ZIP with one folder per input. Defaults now come from one central table (`RELEASE_DEFAULTS`), and the ZIP destination accepts a ZIP archive as well as a folder. Builds expose all their enabled targets but only the targets that a slot, Bundle or other build uses are built, and automatic builds target the current operating system.
