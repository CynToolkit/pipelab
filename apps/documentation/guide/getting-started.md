# Create your first project and workflow

This guide creates a project and a Release workflow.

## Create a project

1. Start Pipelab. Navigation appears immediately; wait for the dashboard's
   project data to load before creating or editing projects.
2. Create a project and give it a name.
3. Select the project before creating a workflow.

A project groups Release workflows. Project deletion is unavailable while the
project still contains workflows.

## Create and run a workflow

1. Choose **New workflow** and provide its name and release details.
2. Select a source and configure its fields.
3. Add destinations and review the recommended build setup.
4. Create the workflow, then use its **Configuration**, **Builds**,
   **Artifacts**, and **Runs** sections to manage and inspect it.

For the complete setup and execution flow, see the
[Release workflow guide](/guide/release-workflows).

If the agent is disconnected, use **Reconnect**. If a section fails to load,
use its **Retry** action and follow [troubleshooting](/guide/troubleshooting).
Navigation remains available while disconnected, but editing and running
workflows require an agent connection. Subscription checks do not block the
dashboard; controls that depend on your plan wait for that check to finish.
