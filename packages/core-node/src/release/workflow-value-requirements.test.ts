import { describe, expect, it } from "vitest";
import type { ReleaseConfig } from "@pipelab/shared";
import { builtInProviders } from "../providers-registry";
import {
  getReleaseWorkflowEnvironmentVariableNames,
  resolveLegacyReleaseConnectionValues,
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

  it("does not treat a bound logical alias as a legacy local Connection ID", () => {
    expect(
      resolveLegacyReleaseConnectionValues(
        [
          {
            alias: "publish",
            required: true,
            providerId: "@pipelab/plugin-itch",
            integrationName: "Itch Butler Account",
            fields: [{ key: "apiKey", required: true }],
          },
        ],
        {
          version: "1.0.0",
          connections: [
            {
              id: "publish",
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              name: "Old connection",
              createdAt: "2020-01-01",
              isDefault: false,
              apiKey: "old-key",
            },
          ],
          workflowBindings: [
            { workflowId: "release-a", alias: "publish", connectionId: "publish" },
          ],
        },
        "release-a",
      ),
    ).toEqual({});
  });

  it("does not treat an unbound current alias as a local Connection ID", () => {
    expect(
      resolveLegacyReleaseConnectionValues(
        [
          {
            alias: "publish",
            required: true,
            providerId: "@pipelab/plugin-itch",
            integrationName: "Itch Butler Account",
            fields: [{ key: "apiKey", required: true }],
          },
        ],
        {
          version: "1.0.0",
          connections: [
            {
              id: "publish",
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              name: "Production Itch account",
              createdAt: "2020-01-01",
              isDefault: false,
              apiKey: "must-not-be-used",
            },
          ],
        },
        "release-current",
      ),
    ).toEqual({});
  });

  it("keeps local Connection ID fallback for explicitly legacy workflows", () => {
    expect(
      resolveLegacyReleaseConnectionValues(
        [
          {
            alias: "legacy-itch-id",
            required: true,
            providerId: "@pipelab/plugin-itch",
            integrationName: "Itch Butler Account",
            fields: [{ key: "apiKey", required: true }],
          },
        ],
        {
          version: "1.0.0",
          connections: [
            {
              id: "legacy-itch-id",
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              name: "Legacy Itch account",
              createdAt: "2020-01-01",
              isDefault: false,
              apiKey: "legacy-key",
            },
          ],
        },
        "release-legacy",
        true,
      ),
    ).toEqual({ "legacy-itch-id": { apiKey: "legacy-key" } });
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
          id: "disabled-build",
          type: "desktop",
          engine: "producer",
          enabled: false,
          config: { version: "${{ env.DISABLED_BUILD }}" },
          targets: [
            { id: "release", enabled: true, config: { output: "${{ env.DISABLED_BUILD_TARGET }}" } },
          ],
        },
        {
          id: "active-build",
          type: "desktop",
          engine: "producer",
          enabled: true,
          config: { version: "${{ env.BUILD_VERSION }}" },
          targets: [
            { id: "release", enabled: false, config: { output: "${{ env.DISABLED_TARGET }}" } },
          ],
        },
      ],
      destinations: [
        {
          id: "disabled-destination",
          provider: "store",
          enabled: false,
          config: { project: "${{ env.DISABLED_DESTINATION }}" },
          slots: [
            { id: "slot", enabled: true, config: { channel: "${{ env.DISABLED_SLOT }}" } },
          ],
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
            { id: "active-slot", enabled: true, config: { channel: "${{ env.STORE_CHANNEL }}" } },
            { id: "inactive-slot", enabled: false, config: { channel: "${{ env.DISABLED_SLOT }}" } },
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
          targets: [{ id: "release", fields: [{ key: "output", type: "file" }] }],
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
      "STORE_PROJECT",
      "STORE_CHANNEL",
    ]);
  });
});
