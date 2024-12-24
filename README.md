# Pipelab

![logo](./readme/full_white_bg_black_text.png)

## What is Pipelab?

A visual tool to create task automation workflows.

## Why use Pipelab?

- Create cross-platform desktop applications
- Deploy to popular platforms (Steam, Itch.io, etc.)
- Automate repetitive tasks

# Getting Started

# Making a release
```
yarn changeset version
yarn changeset tag
```

# Architecture
```mermaid
graph TD
    classDef pipelab fill:#0096FF,stroke:#333,stroke-width:4px;
    classDef todo stroke:#333,stroke-width:4px, stroke-dasharray: 4px;

    DesktopApp[Desktop App - Pipelab]
    GameBundle[Game Editor output]

    subgraph GameEditors
        Construct3[Construct 3]
        Godot[Godot]
        GDevelop[GDevelop]
    end

    PipelabPlugin[Pipelab Plugin]
    SteamPlugin[Steam Plugin]
    CoreMessaging[Core Messaging Library]
    Renderers[Renderers]

    subgraph Runtime
        Electron
        Tauri
        Webview
    end

    subgraph Platforms
        Steam
        Itch
        Poki
    end

    Steamworks[steamworks.js Library]

    GameEditors -->|Bundles to| GameBundle
    GameBundle -->|Is imported into| DesktopApp
    GameEditors -->|Includes| PipelabPlugin

    PipelabPlugin -->|Is included in| GameBundle
    PipelabPlugin -->|Implements| CoreMessaging

    SteamPlugin -->|Is included in| GameBundle
    SteamPlugin -->|Implements| CoreMessaging
    SteamPlugin -->|Uses| Steamworks

    CoreMessaging -->|Passes messages to| Renderers
    Runtime -->|Is embedded in| Renderers
    DesktopApp -->|Packages to| Runtime
    Runtime -->|Handles events from| CoreMessaging

    DesktopApp -->|Deploys to| Platforms
    Platforms -->|Uses| Runtime

    class DesktopApp,PipelabPlugin,SteamPlugin,CoreMessaging pipelab;
    class SteamPlugin,Godot,GDevelop,Tauri,Webview,Itch,Poki todo;
```

# Development
## Enable source maps
```bash
NODE_OPTIONS=--enable-source-maps yarn xxx
```
