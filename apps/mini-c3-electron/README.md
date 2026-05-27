# Pipelab - Construct 3 Electron Exporter

A lightweight, single-page web utility that lets game developers package their HTML5 Construct 3 exports into desktop applications.

## Overview

This tool provides a simple interface where users can upload their C3 export ZIP file, name their application, specify a version, and package it into an Electron framework executable.

- **Frontend**: A custom Vue 3 Single Page Application using glassmorphism, responsive drag-and-drop components, and canvas confetti effects.
- **Backend**: Executes as a serverless Deno-based Supabase Edge Function (`c3-export`). It downloads the correct precompiled Electron base binaries, injects the user's HTML5 game files along with standard entrypoints, renames the executable, and compiles a final ZIP package in-memory.
- **Marketing Nudge**: A built-in feature comparison table designed to encourage developers to migrate to the native Pipelab desktop app for auto-signing, Steam publishing, and full workflow automation.

## Development

To run the dev server:

```bash
pnpm dev
# or from monorepo root:
pnpm --filter mini-c3-electron dev
```

To compile/build:

```bash
pnpm build
# or from monorepo root:
pnpm --filter mini-c3-electron build
```
