# Electron

## Features
- Web based project packaging
- Installer creation
- Native support for Steam overlay
- [Construct 3](/guide/integrations/construct_3.md) and [Steam](/guide/integrations/steam.md) integrations
- True fullscreen mode
- OBS recording support

## Create installer
Create an installer for your game using Electron

## Create package
Create a package for your game using Electron generating an executable for the selected platform

## Preview package
Start the app by loading an URL. You can use it to preview your game using [Construct 3 remote preview](https://www.construct.net/en/blogs/construct-official-blog-1/introducing-remote-preview-877)

## Advanced
You may want to reuse your existing Electron configuration. You can do so by using the separate Package and Configure tasks.

## Configure Electron
Only the Configuration part.

## Create package
The same as the previous task but the configuration is a single parameter.

## FAQ
> Which version of Electron is used when no version is specified?
>
The default version is the one specified in the [Pipelab repository](https://github.com/CynToolkit/pipelab/blob/develop/assets/electron/template/app/package.json#L27).

> Will my game show the little browser bubble when going fullscreen
>
No

> Will my game exit fullscreen when hitting "Escape"
>
If you use the [native Javascript API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen), **Yes** \
If you use the Pipelab fullscreen action, **No**

> I get an error about module not found and Steamworks when running the game
>
Install [Microsoft redistributables](https://www.microsoft.com/fr-fr/download/details.aspx?id=48145)