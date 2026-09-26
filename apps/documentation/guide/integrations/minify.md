# Minify code and images

The Minify plugin registers **Minify code** and **Minify images** pipeline actions. Each accepts one required `input-folder` path and declares no outputs. **Minify code** finds `.js` files recursively and minifies each file in place with esbuild; run it on a working copy if you need to preserve the originals. A missing or inaccessible folder path fails the code action.

**Minify images** is registered in the task picker, but its runner currently only logs “Minified images”; it does not read or change any files. Do not use it as an image optimizer. Neither action declares output variables, and no credentials or separate account setup are required.

## Minimal input

```text
input-folder: /work/game/export
```

Downstream actions that use **Minify code** should read the same folder path after the in-place rewrite completes.
