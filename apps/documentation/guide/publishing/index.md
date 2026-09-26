# Publishing

Publishing is the destination stage of a Release workflow: prepare an application artifact with a source and producer, then connect one or more destinations and deployment slots. Use [Release workflows](../release-workflows.md) to create the workflow and [Runs and history](../runs-and-history.md) to inspect an upload.

## Destinations

| Destination | Accepted artifact | Required destination fields | Required slot fields | Host / account notes |
|---|---|---|---|---|
| [Steam](./steam.md) | Application directory for Windows, Linux, or macOS | Connected Steam account, App ID | Depot ID | Upload host is x64 Linux |
| [Itch.io](./itch.md) | Application or files directory/archive | Connected Itch account, project | Channel | Butler CLI is downloaded/managed by Pipelab |
| [Poki](./poki.md) | Web application directory | Project/Game ID, version name, release notes | None | Uses Poki CLI authentication from Pipelab's third-party configuration directory |

Connect the relevant account in Pipelab before selecting Steam or itch.io. Poki currently uses separate Poki CLI authentication rather than its registered Developer Profile connection. Each enabled deployment slot needs its required slot values. Provider credential requirements and failure cases are documented on the linked pages.

Netlify is a separate pipeline integration with **Build Netlify site** and **Upload to Netlify** actions; it is not a Release workflow destination. See [Netlify](../integrations/netlify.md). Epic Games Store is not an available destination in this build.
