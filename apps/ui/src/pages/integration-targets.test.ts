import { describe, expect, it } from "vitest";
import type { RendererProviderMetadata } from "@pipelab/shared";
import { buildIntegrationTargets } from "./integration-targets";

const provider: RendererProviderMetadata = {
  id: "@pipelab/plugin-steam",
  packageName: "@pipelab/plugin-steam",
  name: "Steam",
  description: "Steam publishing",
  icon: { type: "icon", icon: "pi-box" },
  isOfficial: true,
  integrations: [
    { name: "Steam Account", fields: [{ key: "username", label: "Username", type: "text" }] },
  ],
};

describe("integration targets", () => {
  it("uses shipped metadata without an installed/enabled setting", () => {
    expect(buildIntegrationTargets([provider])).toEqual([
      {
        pluginName: "@pipelab/plugin-steam",
        integrationName: "Steam Account",
        displayName: "Steam",
        icon: provider.icon,
        fields: provider.integrations![0]!.fields,
      },
    ]);
  });
  it("omits providers without credential integrations", () => {
    expect(buildIntegrationTargets([{ ...provider, integrations: undefined }])).toEqual([]);
  });
  it("distinguishes multiple integrations while preserving the provider ID", () => {
    const targets = buildIntegrationTargets([
      {
        ...provider,
        integrations: [
          { name: "First", fields: [] },
          { name: "Second", fields: [] },
        ],
      },
    ]);
    expect(targets.map((target) => target.displayName)).toEqual([
      "Steam - First",
      "Steam - Second",
    ]);
    expect(targets.map((target) => target.pluginName)).toEqual([provider.id, provider.id]);
  });
});
