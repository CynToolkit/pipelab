/// <reference path="./declarations.d.ts" />
import { createProviderDefinition } from "@pipelab/shared";
import { basename, normalize } from "node:path";
import {
  discoverBrowserProfiles,
  isChromiumProfileDirectory,
  listChromiumBrowserProfiles,
} from "./browser-profiles";
import type { ReleaseSourceDefinition } from "@pipelab/shared";
import { CORE_WORKFLOW_TASKS, type WorkflowStep } from "@pipelab/workflow-runtime";
export { discoverBrowserProfiles, inspectChromiumProfile } from "./browser-profiles";
export type { BrowserProfileCandidate } from "./browser-profiles";

import { constructWorkflowTaskFactories } from "./export-c3p";
import { constructProviderLogo } from "../provider-icons";

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
    {
      key: "accountConnectionId",
      type: "connection",
      integration: "Construct Account",
      label: "Construct account",
      description:
        "Optional. Use a saved Construct session from the selected browser profile instead.",
      required: false,
    },
    {
      key: "version",
      type: "text",
      label: "Construct version",
      description:
        "Leave blank to use the release saved with the project. Enter latest or a release such as r397 to override it.",
      required: false,
    },
  ],
  output: { kind: "application", platform: "web", container: "directory" },
  createDefaultConfig: () => ({ path: "", profilePath: "", accountConnectionId: "", version: "" }),
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
  inspect: async (config) => {
    const profiles = await listChromiumBrowserProfiles();
    const selectedProfileValue =
      typeof config.profilePath === "string" ? config.profilePath.trim() : "";
    const selectedProfilePath = selectedProfileValue ? normalize(selectedProfileValue) : "";
    const selectedProfileListed = profiles.some(
      (profile) => normalize(profile.path) === selectedProfilePath,
    );
    const selectedProfileIsCustom =
      Boolean(selectedProfilePath) &&
      !selectedProfileListed &&
      (await isChromiumProfileDirectory(selectedProfilePath));
    const selectedProfileExists =
      !selectedProfilePath || selectedProfileListed || selectedProfileIsCustom;
    const fieldOptions = profiles.map((profile) => ({
      label: `${profile.browser} / ${profile.profileName}`,
      value: profile.path,
    }));
    if (selectedProfileIsCustom) {
      fieldOptions.push({
        label: `Custom / ${basename(selectedProfilePath)}`,
        value: selectedProfilePath,
      });
    }
    return {
      issues: selectedProfileExists
        ? []
        : [
            {
              code: "construct.profile.unavailable",
              message:
                "The selected Chromium profile is no longer available. Choose an existing profile.",
              severity: "error",
              path: "profilePath",
            },
          ],
      fieldOptions: {
        profilePath: fieldOptions,
      },
    };
  },
  compile: (config) => {
    const accountConnectionId =
      typeof config.accountConnectionId === "string" ? config.accountConnectionId : "";
    const steps: WorkflowStep[] = [
      {
        id: "construct-source-export",
        uses: "@pipelab/plugin-construct/export-construct-project",
        with: {
          file: String(config.path || ""),
          customProfile: String(config.profilePath || ""),
          version: String(config.version || ""),
          ...(accountConnectionId ? { accountConnectionId } : {}),
        },
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
  icon: { type: "image", image: constructProviderLogo },
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
    {
      name: "Construct Account",
      fields: [
        { key: "username", label: "Username", type: "text" },
        { key: "password", label: "Password", type: "password" },
      ],
    },
  ],
  release: { sources: [constructSource] },
  workflowTasks: constructWorkflowTaskFactories,
});

export { constructWorkflowTaskFactories };
export default provider;
