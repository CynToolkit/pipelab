/// <reference path="./declarations.d.ts" />
import { createNodeDefinition } from "@pipelab/plugin-core";
import { exportAction, ExportActionRunner } from "./export-c3p";
import { exportProjectAction, ExportProjectActionRunner } from "./export-project";
import { constructVersionValidator } from "./export-shared";
import { discoverBrowserProfiles } from "./browser-profiles";
import type { ReleaseSourceDefinition } from "@pipelab/shared";
import type { WorkflowStep } from "@pipelab/workflow-runtime";
export { discoverBrowserProfiles, inspectChromiumProfile } from "./browser-profiles";
export type { BrowserProfileCandidate } from "./browser-profiles";

const constructSource: ReleaseSourceDefinition = {
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
          },
        ]),
    ...(typeof config.profilePath === "string" && config.profilePath
      ? []
      : [
          {
            code: "construct.profile.required",
            message: "A browser profile path is required.",
            severity: "error" as const,
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
        uses: "@pipelab/plugin-filesystem/unzip-file-node",
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

export default createNodeDefinition({
  id: "@pipelab/plugin-construct",
  packageName: "@pipelab/plugin-construct",
  name: "Construct",
  description: "Pipelab plugin for exporting and packaging Construct 3 projects",
  icon: { type: "icon", icon: "pi-clone" },
  isOfficial: true,
  nodes: [
    {
      node: exportAction,
      runner: ExportActionRunner,
    },
    {
      node: exportProjectAction,
      runner: ExportProjectActionRunner,
    },
  ],
  validators: [
    // {
    //   id: 'construct-version',
    //   description: 'Version must be a valid semver',
    //   validator: constructVersionValidator
    // }
  ],
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
});

export type { Params as ExportParams } from "./export-c3p";
