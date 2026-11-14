import { describe, expect, it } from "vitest";
import type { ReleaseConfig } from "@pipelab/shared";
import { builtInProviders } from "../providers-registry";
import {
  getReleaseWorkflowEnvironmentVariableNames,
  resolveWorkflowConnectionRequirements,
} from "./workflow-value-requirements";

describe("workflow Connection requirements", () => {
  it("rejects one alias reused across incompatible provider integrations", () => {
    expect(() =>
      resolveWorkflowConnectionRequirements(
        [
          { alias: "publish", integration: "@pipelab/plugin-itch", required: true },
          { alias: "publish", integration: "@pipelab/plugin-steam", required: true },
        ],
        builtInProviders,
      ),
    ).toThrow(
      "Workflow Connection alias 'publish' is used for incompatible provider integrations.",
    );
  });

  it("lists only active ordinary environment bindings from persisted workflow fields", () => {
    const config: ReleaseConfig = {
      version: "3.1.0",
      id: "release-a",
      project: "project-a",
      name: "Release A",
      source: {
        provider: "source/folder",
        config: {
          path: "${{ env.PROJECT_PATH }}",
          account: "${{ env.CONNECTION_ALIAS }}",
          unknown: "${{ env.UNKNOWN_FIELD }}",
        },
      },
      builds: [
        {
          id: "unused-build",
          type: "desktop",
          engine: "producer",
          config: { version: "${{ env.DISABLED_BUILD }}" },
          targets: [{ id: "release", config: { output: "${{ env.DISABLED_BUILD_TARGET }}" } }],
        },
        {
          id: "active-build",
          type: "desktop",
          engine: "producer",
          config: { version: "${{ env.BUILD_VERSION }}" },
          targets: [
            { id: "release", config: { output: "${{ env.BUILD_OUTPUT }}" } },
            { id: "debug", config: { output: "${{ env.DISABLED_TARGET }}" } },
          ],
        },
      ],
      destinations: [
        {
          id: "disabled-destination",
          provider: "store",
          enabled: false,
          config: { project: "${{ env.DISABLED_DESTINATION }}" },
          slots: [{ id: "slot", enabled: true, config: { channel: "${{ env.DISABLED_SLOT }}" } }],
        },
        {
          id: "active-destination",
          provider: "store",
          enabled: true,
          config: {
            project: "${{ env.STORE_PROJECT }}",
            account: "${{ env.CONNECTION_ALIAS }}",
          },
          slots: [
            {
              id: "active-slot",
              enabled: true,
              input: { buildId: "active-build", targetId: "release" },
              config: { channel: "${{ env.STORE_CHANNEL }}" },
            },
            {
              id: "inactive-slot",
              enabled: false,
              config: { channel: "${{ env.DISABLED_SLOT }}" },
            },
          ],
        },
      ],
    };
    const registry = {
      sources: [
        {
          id: "source/folder",
          fields: [
            { key: "path", type: "directory" },
            { key: "account", type: "connection", integration: "store" },
          ],
        },
      ],
      producers: [
        {
          id: "producer",
          fields: [{ key: "version", type: "text" }],
          targets: [
            { id: "release", fields: [{ key: "output", type: "file" }] },
            { id: "debug", fields: [{ key: "output", type: "file" }] },
          ],
        },
      ],
      destinations: [
        {
          id: "store",
          fields: [
            { key: "project", type: "text" },
            { key: "account", type: "connection", integration: "store" },
          ],
          slotFields: [{ key: "channel", type: "text" }],
        },
      ],
    } as const;

    expect(getReleaseWorkflowEnvironmentVariableNames(config, registry)).toEqual([
      "PROJECT_PATH",
      "BUILD_VERSION",
      "BUILD_OUTPUT",
      "STORE_PROJECT",
      "STORE_CHANNEL",
    ]);
  });
});
