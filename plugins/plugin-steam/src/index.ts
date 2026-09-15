import { uploadToSteam, uploadToSteamRunner } from "./upload-to-steam";
import { createNodeDefinition } from "@pipelab/plugin-core";

export default createNodeDefinition({
  id: "@pipelab/plugin-steam",
  packageName: "@pipelab/plugin-steam",
  name: "Steam",
  description: "Pipelab plugin for publishing games to Steam via SteamCMD",
  icon: { type: "icon", icon: "mdi-steam" },
  isOfficial: true,
  nodes: [
    {
      node: uploadToSteam,
      runner: uploadToSteamRunner,
    },
  ],
  integrations: [
    {
      name: "Steam Account",
      fields: [
        {
          key: "username",
          label: "Steam Username",
          type: "text",
          placeholder: "e.g., steam_user",
        },
        {
          key: "password",
          label: "Steam Password",
          type: "password",
          placeholder: "Steam password",
        },
      ],
    },
  ],
});
