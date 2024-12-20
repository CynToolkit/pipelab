// @ts-check

import pkg from '../package.json' with { type: 'json' };

/**
 * @satisfies {import('./sdk').Config<'general' | 'window' | 'filesystem' | 'file-dialogs' | 'command-line'>}
 */
const Config = /** @type {const} */({
  addonType: "plugin",
  id: "pipelab",
  name: "Pipelab",
  version: pkg.version,
  category: "platform-specific",
  author: "Armaldio",
  website: "https://www.construct.net",
  documentation: "https://www.construct.net",
  description: "Description",
  addonUrl: "https://www.construct.net/en/make-games/addons/####/XXXX", // displayed in auto-generated docs
  // githubUrl: "https://github.com/skymen/XXXX", // displays latest release version in auto-generated docs
  // icon: "icon.svg", // defaults to "icon.svg" if omitted
  type: "object", // world, object, dom
  fileDependencies: [
    /*
    {
      filename: "filename.js", // no need to include "c3runtime/" prefix
      type:
        "copy-to-output"
        "inline-script"
        "external-dom-script"
        "external-runtime-script"
        "external-css"

      // for copy-to-output only
      // fileType: "image/png"
    }
    */
  ],
  info: {
    // world only
    defaultImageUrl: undefined,
    Set: {
      // world only
      IsResizable: false,
      IsRotatable: false,
      Is3D: false,
      HasImage: false,
      IsTiled: false,
      SupportsZElevation: false,
      SupportsColor: false,
      SupportsEffects: false,
      MustPreDraw: false,

      // object only
      IsSingleGlobal: true,

      // world and object
      CanBeBundled: true,
      IsDeprecated: false,
      GooglePlayServicesEnabled: false,
    },
    AddCommonACEs: {
      // world only
      Position: false,
      SceneGraph: false,
      Size: false,
      Angle: false,
      Appearance: false,
      ZOrder: false,
    },
  },
  properties: [
    /*
    {
      type:
        "integer"
        "float"
        "percent"
        "text"
        "longtext"
        "check"
        "font"
        "combo"
        "color"
        "object"
        "group"
        "link"
        "info"

      id: "property_id",
      options: {
        initialValue: 0,
        interpolatable: false,

        // minValue: 0, // omit to disable
        // maxValue: 100, // omit to disable

        // for type combo only
        // items: [
        //   {itemId1: "item name1" },
        //   {itemId2: "item name2" },
        // ],

        // dragSpeedMultiplier: 1, // omit to disable

        // for type object only
        // allowedPluginIds: ["Sprite", "<world>"],

        // for type link only
        // linkCallback: `function(instOrObj) {}`,
        // linkText: "Link Text",
        // callbackType:
        //   "for-each-instance"
        //   "once-for-type"

        // for type info only
        // infoCallback: `function(inst) {}`,
      },
      name: "Property Name",
      desc: "Property Description",
    }
    */
  ],
  aceCategories: {
    general: "General",
    window: "Window",
    filesystem: "File system",
    'file-dialogs': "File Dialogs",
    'command-line': "Command line",
  },
  Acts: {
    // general
    Initialize: {
      category: "general",
      forward: "_Initialize",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Initialize integration",
      displayText: "Initialize integration",
      description: "Initialize the Pipelab integration",
    },

    // filesystem
    AppendFile: {
      category: "filesystem",
      forward: "_AppendFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to append to.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'contents',
          desc: "The contents to append to the file.",
          name: "Contents",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Append file",
      displayText: "Append [b]{0}[/b] to file [i]{1}[/i]",
      description: "Appends the contents to the file.",
    },
    CopyFile: {
      category: "filesystem",
      forward: "_CopyFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'source',
          desc: "The path to the file to copy.",
          name: "Source",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'destination',
          desc: "The path to the destination file.",
          name: "Destination",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Copy file",
      displayText: "Copy [b]{0}[/b] to [b]{1}[/b]",
      description: "Copies the file.",
    },
    FetchFileSize: {
      category: "filesystem",
      forward: "_FetchFileSize",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to fetch the size.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Fetch file size",
      displayText: "Fetch file size of [b]{0}[/b]",
      description: "Fetch the size of the file.",
    },
    CreateFolder: {
      category: "filesystem",
      forward: "_CreateFolder",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the folder to create.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Create folder",
      displayText: "Create folder [b]{0}[/b]",
      description: "Creates the folder.",
    },
    DeleteFile: {
      category: "filesystem",
      forward: "_DeleteFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to delete.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Delete file",
      displayText: "Delete file [b]{0}[/b]",
      description: "Deletes the file.",
    },
    ListFiles: {
      category: "filesystem",
      forward: "_ListFiles",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the folder to list.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "List files",
      displayText: "List files in [b]{0}[/b]",
      description: "Load a list of files in a given folder. Use expressions after this action to get the count and file names",
    },
    MoveFile: {
      category: "filesystem",
      forward: "_MoveFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'source',
          desc: "The path to the file to move.",
          name: "Source",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'destination',
          desc: "The path to the destination file.",
          name: "Destination",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Move file",
      displayText: "Move [b]{0}[/b] to [b]{1}[/b]",
      description: "Moves the file.",
    },
    OpenBrowser: {
      category: "filesystem",
      forward: "_OpenBrowser",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'url',
          desc: "The URL to open.",
          name: "URL",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Open browser",
      displayText: "Open browser to [b]{0}[/b]",
      description: "Opens the browser.",
    },
    ReadBinaryFile: {
      category: "filesystem",
      forward: "_ReadBinaryFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'tag',
          desc: "The tag of the action.",
          name: "Tag",
          type: 'string',
        },
        {
          id: 'path',
          desc: "The path to the file to read.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: "destination",
          desc: "The Binary Data object to store the file contents.",
          name: "Destination",
          type: 'object',
          allowedPluginIds: ['BinaryData']
        }
      ],
      listName: "Read binary file",
      displayText: "Read binary file [b]{1}[/b] into [b]{2}[/b] ({0})",
      description: "Reads a file into a Binary Data object. Triggers 'On binary file read' when completes.",
    },
    RenameFile: {
      category: "filesystem",
      forward: "_RenameFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'source',
          desc: "The path to the file to rename.",
          name: "Source",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'destination',
          desc: "The path to the destination file.",
          name: "Destination",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Rename file",
      displayText: "Rename [b]{0}[/b] to [b]{1}[/b]",
      description: "Renames the file.",
    },
    RunFile: {
      category: "filesystem",
      forward: "_RunFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "Enter the path of the file to execute. This can also include space-separated arguments. To execute a path wtih spaces in it, wrap in double-quotes (e.g. \"\"\" C:\\Program Files\\file.exe\"\"\"",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Run file",
      displayText: "Run file [b]{0}[/b]",
      description: "Runs the file.",
    },
    ShellOpen: {
      category: "filesystem",
      forward: "_ShellOpen",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to open. The default app associated with the file type will be used.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Shell open",
      displayText: "Shell open [b]{0}[/b]",
      description: "Opens the file in the shell.",
    },
    ExplorerOpen: {
      category: "filesystem",
      forward: "_ExplorerOpen",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to show in the default explorer.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Explorer open",
      displayText: "Explorer open [b]{0}[/b]",
      description: "Opens the path in the explorer.",
    },
    WriteBinaryFile: {
      category: "filesystem",
      forward: "_WriteBinaryFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'tag',
          desc: "The tag of the action.",
          name: "Tag",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'path',
          desc: "The path to the file to write.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'source',
          desc: "The Binary Data object to read the file contents from.",
          name: "Source",
          type: 'object',
          allowedPluginIds: ['BinaryData']
        }
      ],
      listName: "Write binary file",
      displayText: "Write binary file [b]{1}[/b] from [b]{2}[/b] ({0})",
      description: "Writes the binary file.",
    },
    WriteTextFile: {
      category: "filesystem",
      forward: "_WriteTextFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to write.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'contents',
          desc: "The contents to write to the file.",
          name: "Contents",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Write text file",
      displayText: "Write text file [b]{0}[/b] to [b]{1}[/b]",
      description: "Writes the text file.",
    },
    WriteText: {
      category: "filesystem",
      forward: "_WriteTextFile",
      highlight: false,
      deprecated: true,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to write.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        },
        {
          id: 'contents',
          desc: "The contents to write to the file.",
          name: "Contents",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Write text file",
      displayText: "Write text file [b]{0}[/b] to [b]{1}[/b]",
      description: "Writes the text file.",
    },
    ReadTextFile: {
      category: "filesystem",
      forward: "_ReadTextFile",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'path',
          desc: "The path to the file to read.",
          name: "Path",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      description: "Reads the text file.",
      listName: "Read text file",
      displayText: "Read text file [b]{0}[/b]",
    },

    // file-dialogs
    ShowFolderDialog: {
      category: "file-dialogs",
      forward: "_ShowFolderDialog",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Show folder dialog",
      displayText: "Show folder dialog",
      description: "Show a folder dialog",
    },

    ShowOpenDialog: {
      category: "file-dialogs",
      forward: "_ShowOpenDialog",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Show open dialog",
      displayText: "Show open dialog {0}",
      description: "Show an open dialog",
      params: [
        {
          id: 'accept',
          desc: "The file types to accept.",
          name: "Accept",
          type: 'string',
          initialValue: "\"\"",
        }
      ]
    },

    ShowSaveDialog: {
      category: "file-dialogs",
      forward: "_ShowSaveDialog",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Show save dialog",
      displayText: "Show save dialog {0}",
      description: "Show a save dialog",
      params: [
        {
          id: 'accept',
          desc: "The file types to accept.",
          name: "Accept",
          type: 'string',
          initialValue: "\"\"",
        }
      ]
    },

    // window

    Maximize: {
      category: "window",
      forward: "_Maximize",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Maximize",
      displayText: "Maximize window",
      description: "Maximize the window",
    },

    Minimize: {
      category: "window",
      forward: "_Minimize",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Minimize",
      displayText: "Minimize window",
      description: "Minimize the window",
    },

    Restore: {
      category: "window",
      forward: "_Restore",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Restore",
      displayText: "Restore window",
      description: "Restore the window (i.e. show again after minimizing)",
    },

    RequestAttention: {
      category: "window",
      forward: "_RequestAttention",
      highlight: false,
      deprecated: false,
      isAsync: true,

      listName: "Request attention",
      displayText: "Request window attention with mode {0}",
      description: "Start or stop requesting attention from the user, e.g. by flashing the title bar (depends on OS).",
      params: [
        {
          id: 'mode',
          desc: "Whether to request attention or cancel a previous request for Attention.",
          name: "Mode",
          type: 'combo',
          items: [
            { "request": "Request attention" },
            { "cancel": "Stop requesting attention" },
          ]
        }
      ]
    },

    SetAlwaysOnTop: {
      category: "window",
      forward: "_SetAlwaysOnTop",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'mode',
          desc: "Whether to enable or disable the window always being on top.",
          name: "Mode",
          type: 'combo',
          items: [
            { "enable": "Not always on top" },
            { "disable": "Always on top" },
          ]
        }
      ],
      listName: "Set always on top",
      displayText: "Set always on top to {0}",
      description: "Enable or disable the window always being on top of other windows.",
    },

    SetHeight: {
      category: "window",
      forward: "_SetHeight",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'height',
          desc: "The new height of the window.",
          name: "Height",
          type: 'number',
          initialValue: 0,
        }
      ],
      listName: "Set height",
      displayText: "Set windown height to {0}",
      description: "Set the height of the window.",
    },

    SetMaximumSize: {
      category: "window",
      forward: "_SetMaximumSize",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'width',
          desc: "The maximum window width to set, in pixels.",
          name: "Max width",
          type: 'number',
          initialValue: 0,
        },
        {
          id: 'height',
          desc: "The maximum window height to set, in pixels.",
          name: "Max height",
          type: 'number',
          initialValue: 0,
        }
      ],
      listName: "Set maximum size",
      displayText: "Set maximum size to [b]{0}[/b] x [b]{1}[/b]",
      description: "Set the maximum size of the window.",
    },

    SetMinimumSize: {
      category: "window",
      forward: "_SetMinimumSize",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'width',
          desc: "The minimum window width to set, in pixels.",
          name: "Max width",
          type: 'number',
          initialValue: 0,
        },
        {
          id: 'height',
          desc: "The minimum window height to set, in pixels.",
          name: "Max height",
          type: 'number',
          initialValue: 0,
        }
      ],
      listName: "Set minimum size",
      displayText: "Set minimum size to [b]{0}[/b] x [b]{1}[/b]",
      description: "Set the minimum size of the window.",
    },

    SetResizable: {
      category: "window",
      forward: "_SetResizable",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'resizable',
          desc: "Whether to enable or disable the window resizing.",
          name: "Resizable",
          type: 'combo',
          items: [
            { "enable": "Not resizable" },
            { "disable": "Resizable" },
          ]
        }
      ],
      listName: "Set resizable",
      displayText: "Set window {0}",
      description: "Enable or disable the window resizing.",
    },

    SetTitle: {
      category: "window",
      forward: "_SetTitle",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'title',
          desc: "A string to display in the title bar.",
          name: "Title",
          type: 'string',
          initialValue: "\"\"",
        }
      ],
      listName: "Set title",
      displayText: "Set window title to [b]{0}[/b]",
      description: "Set the title of the window.",
    },

    SetWidth: {
      category: "window",
      forward: "_SetWidth",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'width',
          desc: "The new width of the window.",
          name: "Width",
          type: 'number',
          initialValue: 0,
        }
      ],
      listName: "Set width",
      displayText: "Set windown width to {0}",
      description: "Set the width of the window.",
    },

    SetX: {
      category: "window",
      forward: "_SetX",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'x',
          desc: "The new x position of the window.",
          name: "X",
          type: 'number',
          initialValue: 0,
        }
      ],
      listName: "Set x",
      displayText: "Set window X position to {0}",
      description: "Set the x position of the window.",
    },

    SetY: {
      category: "window",
      forward: "_SetY",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'y',
          desc: "The new y position of the window.",
          name: "Y",
          type: 'number',
          initialValue: 0,
        }
      ],
      listName: "Set y",
      displayText: "Set window Y position to {0}",
      description: "Set the y position of the window.",
    },

    ShowDevTools: {
      category: "window",
      forward: "_ShowDevTools",
      highlight: false,
      deprecated: false,
      isAsync: true,
      params: [
        {
          id: 'show',
          desc: "Whether to show or hide the dev tools.",
          name: "Show",
          type: 'combo',
          items: [
            { "show": "Show dev tools" },
            { "hide": "Hide dev tools" },
          ]
        }
      ],
      listName: "Show dev tools",
      displayText: "Set devtool to {0}",
      description: "Show or hide the dev tools.",
    },

    Unmaximize: {
      category: "window",
      forward: "_Unmaximize",
      highlight: false,
      deprecated: false,
      isAsync: true,
      listName: "Unmaximize",
      displayText: "Unmaximize window",
      description: "Unmaximize the window",
    },
  },
  Cnds: {
    IsEngine: {
      category: "general",
      forward: "_IsEngine",
      highlight: false,
      deprecated: false,
      description: "Return true if the engine running the app is the one selected",
      displayText: "Is engine {0}",
      params: [
        {
          id: 'engine',
          desc: "The engine to check",
          name: "Engine",
          type: 'combo',
          items: [
            { "electron": "Electron" },
            { "tauri": "Tauri" }
          ]
        }
      ],
      listName: "Is engine",
    },

    OnFolderDialogCancel: {
      category: "file-dialogs",
      forward: "_OnFolderDialogCancel",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On folder dialog cancel",
      params: [],
      displayText: "On folder dialog cancel",
      description: "Triggered when the folder dialog is canceled",
    },
    OnFolderDialogOk: {
      category: "file-dialogs",
      forward: "_OnFolderDialogOk",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On folder dialog ok",
      params: [],
      displayText: "On folder dialog ok",
      description: "Triggered after a folder chosen from a folder dialog",
    },
    OnOpenDialogCancel: {
      category: "file-dialogs",
      forward: "_OnOpenDialogCancel",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On open dialog cancel",
      params: [],
      displayText: "On open dialog cancel",
      description: "Triggered when the open dialog is canceled",
    },
    OnOpenDialogOk: {
      category: "file-dialogs",
      forward: "_OnOpenDialogOk",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On open dialog ok",
      params: [],
      displayText: "On open dialog ok",
      description: "Triggered after a file chosen from a open dialog",
    },
    OnSaveDialogCancel: {
      category: "file-dialogs",
      forward: "_OnSaveDialogCancel",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On save dialog cancel",
      params: [],
      displayText: "On save dialog cancel",
      description: "Triggered when the save dialog is canceled",
    },
    OnSaveDialogOk: {
      category: "file-dialogs",
      forward: "_OnSaveDialogOk",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On save dialog ok",
      params: [],
      displayText: "On save dialog ok",
      description: "Triggered after a file chosen from a save dialog",
    },

    OnAnyBinaryFileRead: {
      category: "file-dialogs",
      forward: "_OnAnyBinaryFileRead",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On any binary file read",
      params: [],
      displayText: "On any binary file read",
      description: "Triggered when any binary file read completes. The 'FileTag' expression identifies the action.",
    },
    OnAnyBinaryFileWrite: {
      category: "file-dialogs",
      forward: "_OnAnyBinaryFileWrite",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On any binary file written",
      params: [],
      displayText: "On any binary file written",
      description: "Triggered when any binary file write completes. The 'FileTag' expression identifies the action.",
    },
    OnBinaryFileRead: {
      category: "file-dialogs",
      forward: "_OnBinaryFileRead",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On binary file read",
      params: [
        {
          id: 'tag',
          desc: "The tag of the file.",
          name: "Tag",
          type: 'string',
        }
      ],
      displayText: "On binary file {0} read",
      description: "Triggered when binary file read completes. The data is then available in the Binary Data object.",
    },
    OnBinaryFileWrite: {
      category: "file-dialogs",
      forward: "_OnBinaryFileWrite",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On binary file written",
      params: [
        {
          id: 'tag',
          desc: "The tag of the file.",
          name: "Tag",
          type: 'string',
        }
      ],
      displayText: "On binary file {0} written",
      description: "Triggered when a binary file write completes.",
    },
    OnFileDropped: {
      category: "file-dialogs",
      forward: "_OnFileDropped",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On file dropped",
      params: [],
      displayText: "On file dropped",
      description: "Triggered when the user drag-and-drops a file to the window",
    },
    OnFileSystemError: {
      category: "file-dialogs",
      forward: "_OnFileSystemError",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On file system error",
      params: [],
      displayText: "On file system error",
      description: "Triggered when a file operation fails.",
    },
    OnPathVerification: {
      category: "file-dialogs",
      forward: "_OnPathVerification",
      highlight: false,
      deprecated: false,
      isTrigger: true,
      isInvertible: false,
      listName: "On path verification",
      params: [
        {
          id: 'path',
          desc: "The path to verify.",
          name: "Path",
          type: 'string',
        },
        {
          id: 'tag',
          desc: "The tag of the action.",
          name: "Tag",
          type: 'string',
        }
      ],
      displayText: "On path {0} verification ({1})",
      description: "Triggered when a file verification result is available.",
    },
  },
  Exps: {
    // command line
    ArgumentAt: {
      category: "command-line",
      forward: "_ArgumentAt",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      params: [
        {
          id: 'index',
          desc: "The index of the argument to get.",
          name: "Index",
          type: 'number',
        }
      ],
      description: "Get the argument at the given index.",
    },
    ArgumentCount: {
      category: "command-line",
      forward: "_ArgumentCount",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Get the number of arguments.",
    },

    // file dialogs
    ChosenPath: {
      category: "file-dialogs",
      forward: "_ChosenPath",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the chosen path after a file dialog.",
    },

    // file system
    AppFolder: {
      category: "filesystem",
      forward: "_AppFolder",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the folder of the current app.",
    },
    AppFolderURL: {
      category: "filesystem",
      forward: "_AppFolderURL",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the URL of the folder of the current app.",
    },
    DroppedFile: {
      category: "filesystem",
      forward: "_DroppedFile",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the dropped file after a file drop.",
    },
    FileError: {
      category: "filesystem",
      forward: "_FileError",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the error message after a file operation fails.",
    },
    FileSize: {
      category: "filesystem",
      forward: "_FileSize",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Return the size of the file.",
    },
    FileTag: {
      category: "filesystem",
      forward: "_FileTag",
      highlight: false,
      returnType: "string",
      description: "Return the tag of the action.",
    },
    ListAt: {
      category: "filesystem",
      forward: "_ListAt",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      params: [
        {
          id: 'index',
          desc: "The index of the file to get.",
          name: "Index",
          type: 'number',
        }
      ],
      description: "Get the file at the given index.",
    },
    ListCount: {
      category: "filesystem",
      forward: "_ListCount",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Get the number of files in the folder.",
    },
    ProjectFilesFolder: {
      category: "filesystem",
      forward: "_ProjectFilesFolder",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the folder of the project files.",
    },
    ProjectFilesFolderURL: {
      category: "filesystem",
      forward: "_ProjectFilesFolderURL",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the URL of the folder of the project files.",
    },
    ReadFile: {
      category: "filesystem",
      forward: "_ReadFile",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the contents of the file.",
    },
    UserFolder: {
      category: "filesystem",
      forward: "_UserFolder",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      isVariadicParameters: false,
      description: "Return the current User's folder",
    },

    // window
    WindowHeight: {
      category: "window",
      forward: "_WindowHeight",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Return the height of the window.",
    },
    WindowWidth: {
      category: "window",
      forward: "_WindowWidth",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Return the width of the window.",
    },
    WindowTitle: {
      category: "window",
      forward: "_WindowTitle",
      highlight: false,
      deprecated: false,
      returnType: 'string',
      description: "Return the title of the window.",
    },
    WindowX: {
      category: "window",
      forward: "_WindowX",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Return the x position of the window.",
    },
    WindowY: {
      category: "window",
      forward: "_WindowY",
      highlight: false,
      deprecated: false,
      returnType: 'number',
      description: "Return the y position of the window.",
    },
  },
});

export default Config;