/// <reference path="./declarations.d.ts" />
import { createProviderDefinition } from "@pipelab/shared";
import { discoverBrowserProfiles } from "./browser-profiles";
import type { ReleaseSourceDefinition } from "@pipelab/shared";
import { CORE_WORKFLOW_TASKS, type WorkflowStep } from "@pipelab/workflow-runtime";
export { discoverBrowserProfiles, inspectChromiumProfile } from "./browser-profiles";
export type { BrowserProfileCandidate } from "./browser-profiles";

import { constructWorkflowTaskFactories } from "./export-c3p";
import constructLogo from "./assets/construct.webp";

export const constructSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-construct/source",
  label: "Construct project",
  fields: [
    { key: "path", type: "file", label: "Project file", required: true, fileExtensions: ["c3p"] },
    {
      key: "profilePath",
      type: "select",
      label: "Browser profile",
      required: true,
      deferUntilEditor: true,
    },
  ],
  output: { kind: "application", platform: "web", container: "directory" },
  createDefaultConfig: () => ({ path: "", profilePath: "" }),
  validate: (config) => [
    ...(typeof config.path === "string" && config.path
      ? []
      : [
          {
            code: "construct.project.required",
            message: "A Construct project path is required.",
            severity: "error" as const,
            path: "path",
          },
        ]),
    ...(typeof config.profilePath === "string" && config.profilePath
      ? []
      : [
          {
            code: "construct.profile.required",
            message: "A browser profile path is required.",
            severity: "error" as const,
            path: "profilePath",
          },
        ]),
  ],
  inspect: async () => ({
    issues: [],
    fieldOptions: {
      profilePath: (await discoverBrowserProfiles()).map((profile) => ({
        label: `${profile.browser} / ${profile.profileName}`,
        value: profile.path,
      })),
    },
  }),
  compile: (config) => {
    const steps: WorkflowStep[] = [
      {
        id: "construct-source-export",
        uses: "@pipelab/plugin-construct/export-construct-project",
        with: { file: String(config.path || ""), customProfile: String(config.profilePath || "") },
        artifacts: {
          zipFile: {
            descriptor: {
              kind: "files",
              technology: "construct",
              container: "archive",
              format: "zip",
            },
          },
        },
      },
      {
        id: "construct-source-extract",
        uses: CORE_WORKFLOW_TASKS.unzip,
        needs: ["construct-source-export"],
        artifactInputs: { file: { stepId: "construct-source-export", artifact: "zipFile" } },
        artifacts: { output: { descriptor: constructSource.output } },
      },
    ];
    return {
      steps,
      artifact: {
        reference: { stepId: "construct-source-extract", artifact: "output" },
        descriptor: constructSource.output,
      },
    };
  },
};

export const provider = createProviderDefinition({
  id: "@pipelab/plugin-construct",
  packageName: "@pipelab/plugin-construct",
  name: "Construct",
  description: "Pipelab provider for exporting and packaging Construct 3 projects",
  icon: { type: "image", image: constructLogo },
  isOfficial: true,
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
  release: { sources: [constructSource] },
  workflowTasks: constructWorkflowTaskFactories,
});

export { constructWorkflowTaskFactories };
export default provider;
