import { uploadToSteam, uploadToSteamRunner } from "./upload-to-steam";
import { createNodeDefinition } from "@pipelab/plugin-core";
const icon = new URL("./steam.webp", import.meta.url).href;

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
