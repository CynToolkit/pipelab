import { previewRunner } from "./preview";

import { createNodeDefinition } from "@pipelab/plugin-core";
import { createPackageProps, createPreviewProps, IDPreview, IDPackage } from "./discord";
import { packageV2Runner } from "./package";

export default createNodeDefinition({
  id: "@pipelab/plugin-discord",
  packageName: "@pipelab/plugin-discord",
  name: "Discord",
  description: "Pipelab plugin for Discord Rich Presence and notifications",
  icon: { type: "icon", icon: "pi-discord" },
  isOfficial: true,
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
  integrations: [
    {
      name: "Discord Connection",
      fields: [
        {
          key: "apiKey",
          label: "Webhook URL",
          type: "text",
          placeholder: "https://discord.com/api/webhooks/...",
        },
      ],
    },
  ],
});
