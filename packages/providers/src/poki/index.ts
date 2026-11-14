import {
  checkPokiPreflight,
  testPokiConnection,
  createPokiUploadTask,
  WORKFLOW_TASK_ID,
  type PokiTaskServices,
} from "./export";

import { createProviderDefinition } from "@pipelab/shared";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

export { createPokiUploadTask, WORKFLOW_TASK_ID };

const pokiDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/plugin-poki/destination",
  label: "Poki",
  accepts: { kind: "application", platform: "web", container: "directory" },
  fields: [
    {
      key: "accountConnectionId",
      type: "connection",
      integration: "@pipelab/plugin-poki",
      label: "Poki account",
    },
    { key: "project", type: "text", label: "Poki project", required: true },
  ],
  createDefaultConfig: () => ({ accountConnectionId: "", project: "" }),
  validate: (config) =>
    ["project"]
      .filter((key) => !String(config.config[key] || "").trim())
      .map((key) => ({
        code: `poki.${key}.required`,
        message: `Poki ${key} is required.`,
        severity: "error" as const,
        path: `config.${key}`,
      })),
  compile: (artifact, destination, slot, context) => {
    const version = String(context.variables?.version ?? "");
    const notes = String(context.variables?.releaseNotes ?? "").trim() || version;
    return [
      {
        id: `poki-${destination.id}-${slot.id}`,
        uses: WORKFLOW_TASK_ID,
        needs: [artifact.reference.stepId],
        artifactInputs: { "input-folder": artifact.reference },
        with: { ...destination.config, ...slot.config, name: version, notes },
        delivery: {
          destinationId: destination.id,
          slotId: slot.id,
          artifact: artifact.reference,
        },
      },
    ];
  },
};

export const provider = createProviderDefinition({
  id: "@pipelab/plugin-poki",
  packageName: "@pipelab/plugin-poki",
  name: "Poki",
  description: "Pipelab provider for publishing HTML5 games to Poki",
  icon: { type: "icon", icon: "pi-globe" },
  isOfficial: true,
  integrations: [
    {
      name: "Poki Account",
      testable: true,
      fields: [
        {
          key: "account",
          label: "Account name",
          type: "text",
          placeholder: "e.g., studio",
        },
      ],
    },
  ],
  release: { destinations: [pokiDestination] },
  connectionTests: { "@pipelab/plugin-poki": testPokiConnection },
  preflights: { [WORKFLOW_TASK_ID]: checkPokiPreflight },
  workflowTasks: {
    [WORKFLOW_TASK_ID]: (services: PokiTaskServices) => createPokiUploadTask(services),
  },
});

export default provider;
