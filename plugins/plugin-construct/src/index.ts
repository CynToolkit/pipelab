import { createNodeDefinition } from "@pipelab/plugin-core";
import { exportAction, ExportActionRunner } from "./export-c3p";
import { exportProjectAction, ExportProjectActionRunner } from "./export-project";
import { constructVersionValidator } from "./export-shared";

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
  ],
});

export type { Params as ExportParams } from "./export-c3p";
