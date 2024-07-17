import { uploadToSteam, uploadToSteamRunner } from "./upload-to-steam.js";
import { createNodeDefinition } from "@cyn/plugin-core";
import icon from './steam.webp'

export default createNodeDefinition({
  description: "Steam",
  id: "steam",
  name: "Steam",
  icon: {
    type: "image",
    image: icon,
  },
  nodes: [
    {
      node: uploadToSteam,
      runner: uploadToSteamRunner,
    },
  ],
});
