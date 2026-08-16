---
"@pipelab/asset-tauri": patch
"@pipelab/core-node": patch
---

Align Tauri crate versions to 2.11.5 and fold mobile (Android/iOS) support into the `@pipelab/asset-tauri` template instead of a separate `apps/mobile` package. `fetchPipelabAsset` now also resolves the local asset via `PIPELAB_ASSET_ROOT` (in addition to the auto-detected monorepo root), so a published CLI can be pointed at a local asset checkout.
