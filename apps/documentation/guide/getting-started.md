# Create your first project and workflow

This guide creates a project and a Release workflow.

## Create a project

1. Start Pipelab. Navigation appears immediately; wait for the dashboard's
   project data to load before creating or editing projects.
2. Create a project and give it a name.
3. Select the project before creating a workflow.

A project groups Release workflows. Project deletion is unavailable while the
project still contains workflows.

While the interface files download, the Pipelab logo and loading animation appear
using the last confirmed theme on this device. Navigation opens before the current
screen finishes loading. Fonts and screen data load independently, and dialogs
load when you open them.

## Create and run a workflow

1. Choose **New workflow**, select a source, and enter a name. The wizard keeps
   source paths for Configuration, where you can choose the project file or
   folder after creation.
2. Choose one or more destinations, review the **Name**, **Source**, and
   **Destinations** recap, then choose **Create workflow**. Pipelab applies
   build and output defaults when it can.
3. Complete any **Action required** item in the workflow's **Configuration**,
   **Builds**, or **Connections** section, then use **Artifacts** and **Runs**
   to inspect the workflow after shipping.

For the complete setup and execution flow, see the
[Release workflow guide](/guide/release-workflows).

If the agent is disconnected, use **Reconnect**. If a section fails to load,
use its **Retry** action and follow [troubleshooting](/guide/troubleshooting).
Navigation remains available while disconnected, but editing and running
workflows require an agent connection. Subscription checks do not block the
dashboard; controls that depend on your plan wait for that check to finish.
