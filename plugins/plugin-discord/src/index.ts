import { previewRunner } from "./preview";

import { createNodeDefinition } from "@pipelab/plugin-core";
const icon = new URL("./public/discord.webp", import.meta.url).href;
import { createPackageProps, createPreviewProps, IDPreview, IDPackage } from "./discord";
import { packageV2Runner } from "./package";

export default createNodeDefinition({
  description: "Discord",
  name: "Discord",
  id: "dicord",
  icon: {
    type: "image",
    image: icon,
  },
  nodes: [
    {
      node: createPackageProps(
        IDPackage,
        "Package as Discord Activity",
        "Package your app as a Discord Activity",
        "",
        "`Package app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
        false,
        false,
        undefined,
        false,
        false,
      ),
      runner: packageV2Runner,
    },
    {
      node: createPreviewProps(
        IDPreview,
        "Preview Discord Acitivity app",
        "Package and preview your app as a Discord Activity",
        "",
        "`Preview app from ${fmt.param(params['input-folder'], 'primary', 'Input folder not set')}`",
      ),
      runner: previewRunner,
    },
  ],
});
