# Folder and ZIP providers

Release workflows include built-in providers for local folders and ZIP files.
They move or package files; they do not build or validate the contents of a
game or web app.

## Sources

| Source | Required field | Artifact provided |
|---|---|---|
| Folder | **Folder path** | Files in a directory |
| Web app folder | **Folder path** | Web application in a directory |
| ZIP | **ZIP path** | Files in a ZIP archive |
| Web app ZIP | **ZIP path** | Web application in a ZIP archive |

Folder sources copy the selected directory and its contents into the workflow
workspace. ZIP sources copy the selected archive. Choose a web app source when
the project is already exported for a browser; the label supplies the web
application type used by provider compatibility checks.

## Extracting ZIP sources

The **Extract ZIP** producer accepts ZIP archives and provides their contents
as a directory artifact. The planner can add it automatically when a later
provider requires a directory, such as when sending a web app ZIP to a desktop
packaging producer. It is not a selectable build option in the editor.

## Destinations

Each deployment of a Folder or ZIP destination has its own output path, so
several deployments can write to different locations.

- **Folder** requires an **Output folder** path on each deployment. Pipelab
  copies the selected artifact's files recursively into a subfolder of it named
  after the deployment (for example `/output/Deployment 1`), clearing that
  subfolder first. The deployment list shows the full path with the subfolder in
  bold. A Folder destination reads a build output, never the source directly.
- **ZIP** requires a **ZIP output path** on each deployment and accepts directory artifacts. Use
  the browse button to choose where to save the archive and type a new file name
  (the file does not need to exist yet). It writes the directory contents as an
  archive at that path and creates its parent directory if needed.

::: warning
A Folder deployment clears its own subfolder before copying the artifact.
Renaming a deployment changes the subfolder it writes to, and the old one is
left in place.
:::

For an already exported build, select **Folder** with `./dist` as the source,
then choose **ZIP** with `./release/game.zip` as the output path. No build
provider is needed for this copy-and-package flow. The ZIP destination creates
the parent directory when needed.

For the other registered sources, producers, and destinations, see the
[provider catalog](/guide/integrations/).
