/// <reference path="./declarations.d.ts" />
import { createProviderDefinition } from "@pipelab/shared";
import { basename, normalize } from "node:path";
import {
  discoverBrowserProfiles,
  isChromiumProfileDirectory,
  listChromiumBrowserProfiles,
} from "./browser-profiles";
import type { ReleaseFieldOption, ReleaseSourceDefinition } from "@pipelab/shared";
import { getSavedConstructVersion } from "./saved-version";
export { discoverBrowserProfiles, inspectChromiumProfile } from "./browser-profiles";
export type { BrowserProfileCandidate } from "./browser-profiles";

import { constructWorkflowTaskFactories } from "./export-c3p";
import { constructProviderLogo } from "../provider-icons";
import { constructProducer } from "./producer";
import { checkConstructPreflight, testConstructConnection } from "./preflight";

// Whatever is entered as the version is appended to the editor URL as-is; these only save typing.
const constructVersionKeywords: ReleaseFieldOption[] = [
  { label: "latest", value: "latest" },
  { label: "beta", value: "beta" },
];

export const constructSource: ReleaseSourceDefinition = {
  id: "@pipelab/plugin-construct/source",
  label: "Construct project",
  fields: [
    {
      key: "path",
      type: "file",
      label: "Project file",
      required: true,
      fileExtensions: ["c3p"],
      showInWizard: true,
    },
    {
      key: "profilePath",
      type: "select",
      label: "Browser profile",
      required: true,
    },
    {
      key: "accountConnectionId",
      type: "connection",
      integration: "Construct Account",
      label: "Construct account",
      required: false,
    },
    {
      key: "version",
      type: "text",
      label: "Construct version",
      placeholder: "Empty: the project's saved release",
      options: constructVersionKeywords,
      required: false,
    },
  ],
  output: { kind: "project", technology: "construct", container: "file" },
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
    ...(Object.hasOwn(config, "accountConnectionId") &&
    typeof config.accountConnectionId !== "string"
      ? [
          {
            code: "construct.connection.invalid",
            message: "A Construct Account alias must be a string.",
            severity: "error" as const,
            path: "accountConnectionId",
          },
        ]
      : []),
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
    // Offer the release the project was saved with first, so it can be pinned in one click.
    const savedVersion =
      typeof config.path === "string" && config.path.trim()
        ? await getSavedConstructVersion(config.path.trim())
        : undefined;
    const versionOptions: ReleaseFieldOption[] = [
      ...(savedVersion
        ? [{ label: `${savedVersion} · saved in project`, value: savedVersion }]
        : []),
      ...constructVersionKeywords,
    ];
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
        version: versionOptions,
      },
    };
  },
  compile: (config) => ({
    steps: [
      {
        id: "release-construct-source",
        uses: "@pipelab/core/passthrough",
        with: { path: config.path },
        artifacts: { output: { descriptor: constructSource.output } },
      },
    ],
    artifact: {
      reference: { stepId: "release-construct-source", artifact: "output" },
      descriptor: constructSource.output,
    },
  }),
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
      testable: true,
    },
  ],
  release: { sources: [constructSource], producers: [constructProducer] },
  workflowTasks: constructWorkflowTaskFactories,
  connectionTests: { "@pipelab/plugin-construct": testConstructConnection },
  preflights: { "@pipelab/plugin-construct/export-construct-project": checkConstructPreflight },
});

export { constructWorkflowTaskFactories };
export default provider;
