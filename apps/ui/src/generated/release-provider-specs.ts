import type { BrowserProviderSpecs } from "@pipelab/shared";

const browserProviderSpecs = {
  schemaVersion: 1,
  releaseConfigVersion: "3.0.0",
  catalog: {
    buildTypes: [
      {
        id: "desktop",
        label: "Desktop",
      },
      {
        id: "web",
        label: "Web",
      },
      {
        id: "mobile",
        label: "Mobile",
      },
      {
        id: "console",
        label: "Console",
      },
    ],
    sources: [
      {
        id: "@pipelab/core/source/folder",
        label: "Folder",
        fields: [
          {
            key: "path",
            type: "directory",
            label: "Folder path",
            required: true,
          },
        ],
        output: {
          kind: "files",
          container: "directory",
        },
        defaultConfig: {
          path: "",
        },
        requiresAgentInspection: false,
      },
      {
        id: "@pipelab/core/source/web-folder",
        label: "Web app folder",
        fields: [
          {
            key: "path",
            type: "directory",
            label: "Folder path",
            required: true,
          },
        ],
        output: {
          kind: "application",
          platform: "web",
          container: "directory",
        },
        defaultConfig: {
          path: "",
        },
        requiresAgentInspection: false,
      },
      {
        id: "@pipelab/core/source/zip",
        label: "ZIP",
        fields: [
          {
            key: "path",
            type: "file",
            label: "ZIP path",
            required: true,
            fileExtensions: ["zip"],
          },
        ],
        output: {
          kind: "files",
          container: "archive",
          format: "zip",
        },
        defaultConfig: {
          path: "",
        },
        requiresAgentInspection: false,
      },
      {
        id: "@pipelab/core/source/web-zip",
        label: "Web app ZIP",
        fields: [
          {
            key: "path",
            type: "file",
            label: "ZIP path",
            required: true,
            fileExtensions: ["zip"],
          },
        ],
        output: {
          kind: "application",
          platform: "web",
          container: "archive",
          format: "zip",
        },
        defaultConfig: {
          path: "",
        },
        requiresAgentInspection: false,
      },
      {
        id: "@pipelab/plugin-construct/source",
        label: "Construct project",
        fields: [
          {
            key: "path",
            type: "file",
            label: "Project file",
            required: true,
            fileExtensions: ["c3p"],
          },
          {
            key: "profilePath",
            type: "select",
            label: "Browser profile",
            required: true,
            deferUntilEditor: true,
          },
        ],
        output: {
          kind: "application",
          platform: "web",
          container: "directory",
        },
        defaultConfig: {
          path: "",
          profilePath: "",
        },
        requiresAgentInspection: true,
      },
      {
        id: "@pipelab/plugin-godot/source",
        label: "Godot project",
        fields: [
          {
            key: "path",
            type: "directory",
            label: "Project path",
            required: true,
          },
        ],
        output: {
          kind: "project",
          technology: "godot",
          container: "directory",
        },
        defaultConfig: {
          path: "",
        },
        requiresAgentInspection: true,
      },
    ],
    producers: [
      {
        id: "@pipelab/core/passthrough",
        label: "Passthrough",
        accepts: {},
        planning: {
          mode: "automatic",
        },
        defaultConfig: {},
        requiresAgentInspection: false,
        targets: [
          {
            id: "output",
            label: "Output",
            transform: {
              changes: {},
            },
            defaultConfig: {},
          },
        ],
      },
      {
        id: "@pipelab/core/unzip",
        label: "Extract ZIP",
        accepts: {
          container: "archive",
          format: "zip",
        },
        planning: {
          mode: "automatic",
        },
        defaultConfig: {},
        requiresAgentInspection: false,
        targets: [
          {
            id: "output",
            label: "Extracted files",
            transform: {
              changes: {
                container: "directory",
              },
              remove: ["format"],
            },
            defaultConfig: {},
          },
        ],
      },
      {
        id: "@pipelab/plugin-electron/producer",
        label: "Electron",
        accepts: {
          kind: "application",
          platform: "web",
          container: "directory",
        },
        planning: {
          mode: "build",
        },
        defaultConfig: {},
        requiresAgentInspection: false,
        targets: [
          {
            id: "windows-x64",
            label: "windows-x64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "electron",
              platform: "windows",
              architecture: "x64",
              container: "directory",
            },
            defaultConfig: {},
            availabilityStatus: "unknown",
          },
          {
            id: "linux-x64",
            label: "linux-x64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "electron",
              platform: "linux",
              architecture: "x64",
              container: "directory",
            },
            defaultConfig: {},
            availabilityStatus: "unknown",
          },
          {
            id: "macos-arm64",
            label: "macos-arm64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "electron",
              platform: "macos",
              architecture: "arm64",
              container: "directory",
            },
            defaultConfig: {},
            availabilityStatus: "unknown",
          },
        ],
      },
      {
        id: "@pipelab/plugin-tauri/producer",
        label: "Tauri",
        accepts: {
          kind: "application",
          platform: "web",
          container: "directory",
        },
        planning: {
          mode: "build",
        },
        defaultConfig: {},
        requiresAgentInspection: false,
        targets: [
          {
            id: "windows-x64",
            label: "windows-x64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "tauri",
              platform: "windows",
              architecture: "x64",
              container: "directory",
            },
            defaultConfig: {},
            availabilityStatus: "unknown",
          },
          {
            id: "linux-x64",
            label: "linux-x64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "tauri",
              platform: "linux",
              architecture: "x64",
              container: "directory",
            },
            defaultConfig: {},
            availabilityStatus: "unknown",
          },
          {
            id: "macos-arm64",
            label: "macos-arm64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "tauri",
              platform: "macos",
              architecture: "arm64",
              container: "directory",
            },
            defaultConfig: {},
            availabilityStatus: "unknown",
          },
        ],
      },
      {
        id: "@pipelab/plugin-godot/producer",
        label: "Godot exporter",
        accepts: {
          kind: "project",
          technology: "godot",
          container: "directory",
        },
        planning: {
          mode: "build",
        },
        defaultConfig: {
          executable: "",
        },
        requiresAgentInspection: true,
        targets: [
          {
            id: "windows-x64",
            label: "windows-x64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "godot",
              platform: "windows",
              architecture: "x64",
              container: "directory",
            },
            defaultConfig: {
              preset: "",
            },
            fields: [
              {
                key: "preset",
                type: "select",
                label: "Godot export preset",
                required: true,
              },
            ],
            availabilityStatus: "unknown",
          },
          {
            id: "linux-x64",
            label: "linux-x64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "godot",
              platform: "linux",
              architecture: "x64",
              container: "directory",
            },
            defaultConfig: {
              preset: "",
            },
            fields: [
              {
                key: "preset",
                type: "select",
                label: "Godot export preset",
                required: true,
              },
            ],
            availabilityStatus: "unknown",
          },
          {
            id: "macos-arm64",
            label: "macos-arm64",
            buildType: "desktop",
            output: {
              kind: "application",
              technology: "godot",
              platform: "macos",
              architecture: "arm64",
              container: "directory",
            },
            defaultConfig: {
              preset: "",
            },
            fields: [
              {
                key: "preset",
                type: "select",
                label: "Godot export preset",
                required: true,
              },
            ],
            availabilityStatus: "unknown",
          },
          {
            id: "web",
            label: "web",
            buildType: "web",
            output: {
              kind: "application",
              technology: "godot",
              platform: "web",
              container: "directory",
            },
            defaultConfig: {
              preset: "",
            },
            fields: [
              {
                key: "preset",
                type: "select",
                label: "Godot export preset",
                required: true,
              },
            ],
            availabilityStatus: "unknown",
          },
        ],
      },
    ],
    destinations: [
      {
        id: "@pipelab/core/destination/folder",
        label: "Folder",
        fields: [
          {
            key: "outputDir",
            type: "directory",
            label: "Output folder",
            required: true,
          },
        ],
        accepts: {},
        defaultConfig: {
          outputDir: "",
        },
      },
      {
        id: "@pipelab/core/destination/zip",
        label: "ZIP",
        fields: [
          {
            key: "outputPath",
            type: "file",
            label: "ZIP output path",
            required: true,
          },
        ],
        accepts: {
          container: "directory",
        },
        defaultConfig: {
          outputPath: "",
        },
      },
      {
        id: "@pipelab/plugin-steam/destination",
        label: "Steam",
        fields: [
          {
            key: "accountConnectionId",
            type: "connection",
            integration: "@pipelab/plugin-steam",
            label: "Steam account",
            required: true,
          },
          {
            key: "appId",
            type: "text",
            label: "Steam App ID",
            required: true,
          },
          {
            key: "description",
            type: "text",
            label: "Build description",
          },
        ],
        slotFields: [
          {
            key: "depotId",
            type: "text",
            label: "Depot ID",
            required: true,
          },
        ],
        accepts: {
          kind: "application",
          platform: ["windows", "linux", "macos"],
          container: "directory",
        },
        defaultConfig: {
          accountConnectionId: "",
          appId: "",
          description: "",
        },
      },
      {
        id: "@pipelab/plugin-itch/destination",
        label: "Itch.io",
        fields: [
          {
            key: "accountConnectionId",
            type: "connection",
            integration: "@pipelab/plugin-itch",
            label: "Itch account",
            required: true,
          },
          {
            key: "project",
            type: "text",
            label: "Project",
            required: true,
          },
        ],
        slotFields: [
          {
            key: "channel",
            type: "text",
            label: "Channel",
            required: true,
          },
        ],
        accepts: {
          kind: ["application", "files"],
          container: ["directory", "archive"],
        },
        defaultConfig: {
          accountConnectionId: "",
          project: "",
        },
      },
      {
        id: "@pipelab/plugin-poki/destination",
        label: "Poki",
        fields: [
          {
            key: "project",
            type: "text",
            label: "Poki project",
            required: true,
          },
          {
            key: "name",
            type: "text",
            label: "Version name",
            required: true,
          },
          {
            key: "notes",
            type: "text",
            label: "Release notes",
            required: true,
          },
        ],
        accepts: {
          kind: "application",
          platform: "web",
          container: "directory",
        },
        defaultConfig: {
          project: "",
          name: "",
          notes: "",
        },
      },
    ],
  },
  providers: [
    {
      id: "@pipelab/plugin-construct",
      name: "Construct",
      icon: {
        type: "image",
        image:
          "data:image/webp;base64,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",
      },
      description: "Pipelab provider for exporting and packaging Construct 3 projects",
      isOfficial: true,
      packageName: "@pipelab/plugin-construct",
      integrations: [
        {
          name: "Browser Executable",
          fields: [
            {
              key: "path",
              label: "Browser Executable Path",
              type: "file",
              placeholder: "e.g., /usr/bin/google-chrome",
            },
          ],
        },
        {
          name: "Browser Profile",
          fields: [
            {
              key: "path",
              label: "Chrome profile directory",
              type: "directory",
              placeholder: "e.g., ~/.config/google-chrome",
            },
          ],
        },
      ],
    },
    {
      id: "@pipelab/plugin-electron",
      name: "Electron",
      icon: {
        type: "icon",
        icon: "pi-desktop",
      },
      description: "Pipelab provider for packaging apps with Electron",
      isOfficial: true,
      packageName: "@pipelab/plugin-electron",
    },
    {
      id: "@pipelab/plugin-steam",
      name: "Steam",
      icon: {
        type: "icon",
        icon: "mdi-steam",
      },
      description: "Pipelab provider for publishing games to Steam via SteamCMD",
      isOfficial: true,
      packageName: "@pipelab/plugin-steam",
      integrations: [
        {
          name: "Steam Account",
          fields: [
            {
              key: "username",
              label: "Steam Username",
              type: "text",
              placeholder: "e.g., steam_user",
            },
          ],
        },
      ],
    },
    {
      id: "@pipelab/plugin-itch",
      name: "Itch.io",
      icon: {
        type: "icon",
        icon: "pi-palette",
      },
      description: "Pipelab provider for publishing games to itch.io",
      isOfficial: true,
      packageName: "@pipelab/plugin-itch",
      integrations: [
        {
          name: "Itch Butler Account",
          fields: [
            {
              key: "apiKey",
              label: "API key",
              type: "password",
              placeholder: "API key",
            },
          ],
        },
      ],
    },
    {
      id: "@pipelab/plugin-poki",
      name: "Poki",
      icon: {
        type: "icon",
        icon: "pi-globe",
      },
      description: "Pipelab provider for publishing HTML5 games to Poki",
      isOfficial: true,
      packageName: "@pipelab/plugin-poki",
    },
    {
      id: "@pipelab/plugin-tauri",
      name: "Tauri",
      icon: {
        type: "icon",
        icon: "pi-box",
      },
      description: "Pipelab provider for packaging apps with Tauri",
      isOfficial: true,
      packageName: "@pipelab/plugin-tauri",
    },
    {
      id: "@pipelab/plugin-godot",
      name: "Godot",
      icon: {
        type: "image",
        image:
          "data:image/svg+xml;base64,PCEtLSBHb2RvdCBFbmdpbmUgTG9nbyDCqSAyMDE3IEFuZHJlYSBDYWxhYnLDsywgQ0MgQlkgNC4wLiBTb3VyY2UgYW5kIGxpY2Vuc2U6IGh0dHBzOi8vZ2l0aHViLmNvbS9nb2RvdGVuZ2luZS9nb2RvdC90cmVlL21hc3Rlci9taXNjL2xvZ28gLS0+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0Ij48ZyBmaWxsPSIjZmZmIj48cGF0aCBkPSJNMTA1IDY3M3YzM3E0MDcgMzU0IDgxNCAwdi0zM3oiLz48cGF0aCBmaWxsPSIjNDc4Y2JmIiBkPSJtMTA1IDY3MyAxNTIgMTRxMTIgMSAxNSAxNGw0IDY3IDEzMiAxMCA4LTYxcTItMTEgMTUtMTVoMTYycTEzIDQgMTUgMTVsOCA2MSAxMzItMTAgNC02N3EzLTEzIDE1LTE0bDE1Mi0xNFY0MjdxMzAtMzkgNTYtODEtMzUtNTktODMtMTA4LTQzIDIwLTgyIDQ3LTQwLTM3LTg4LTY0IDctNTEgOC0xMDItNTktMjgtMTIzLTQyLTI2IDQzLTQ2IDg5LTQ5LTctOTggMC0yMC00Ni00Ni04OS02NCAxNC0xMjMgNDIgMSA1MSA4IDEwMi00OCAyNy04OCA2NC0zOS0yNy04Mi00Ny00OCA0OS04MyAxMDggMjYgNDIgNTYgODF6bTAgMzN2MzljMCAyNzYgODEzIDI3NiA4MTQgMHYtMzlsLTEzNCAxMi01IDY5cS0yIDEwLTE0IDEzbC0xNjIgMTFxLTEyIDAtMTYtMTFsLTEwLTY1SDQ0NmwtMTAgNjVxLTQgMTEtMTYgMTFsLTE2Mi0xMXEtMTItMy0xNC0xM2wtNS02OXoiLz48cGF0aCBkPSJNNDgzIDYwMGMwIDM0IDU4IDM0IDU4IDB2LTg2YzAtMzQtNTgtMzQtNTggMHoiLz48Y2lyY2xlIGN4PSI3MjUiIGN5PSI1MjYiIHI9IjkwIi8+PGNpcmNsZSBjeD0iMjk5IiBjeT0iNTI2IiByPSI5MCIvPjwvZz48ZyBmaWxsPSIjNDE0MDQyIj48Y2lyY2xlIGN4PSIzMDciIGN5PSI1MzIiIHI9IjYwIi8+PGNpcmNsZSBjeD0iNzE3IiBjeT0iNTMyIiByPSI2MCIvPjwvZz48L3N2Zz4K",
      },
      description: "Godot Release provider",
      isOfficial: true,
      packageName: "@pipelab/plugin-godot",
    },
  ],
} satisfies BrowserProviderSpecs;

export default browserProviderSpecs;
