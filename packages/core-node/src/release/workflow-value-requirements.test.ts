import { describe, expect, it } from "vitest";
import type { ReleaseConfig, ReleaseFieldDefinition, ReleaseRegistry } from "@pipelab/shared";
import { builtInProviders } from "../providers-registry";
import { buildHostNeutralRegistry } from "./test-registry";
import { planReleaseForHost } from "./plan-for-host";
import {
  getReleaseWorkflowEnvironmentVariableNames,
  getReleaseWorkflowValueRequirements,
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

  describe("environment bindings and requirements share one plan", () => {
    const host = { platform: "linux", architecture: "x64" };
    const textField = (key: string, required = false): ReleaseFieldDefinition => ({
      key,
      type: "text",
      label: key,
      required,
    });
    // The built-in producers declare no text fields, so add some to see which values are read.
    const registry: ReleaseRegistry = (() => {
      const base = buildHostNeutralRegistry();
      return {
        ...base,
        producers: base.producers.map((producer) =>
          producer.id === "@pipelab/plugin-construct/producer"
            ? {
                ...producer,
                targets: producer.targets.map((target) => ({
                  ...target,
                  fields: [textField("out", true)],
                })),
              }
            : producer.id === "@pipelab/plugin-electron/producer"
              ? {
                  ...producer,
                  targets: producer.targets.map((target) => ({
                    ...target,
                    fields: [textField("out")],
                  })),
                }
              : producer,
        ),
      };
    })();
    const env = (name: string) => `\${{ env.${name} }}`;
    const config: ReleaseConfig = {
      version: "3.1.0",
      id: "release-a",
      project: "project-a",
      name: "Release A",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: {
          path: env("PROJECT_PATH"),
          profilePath: "/profile",
          version: `r-${env("CONSTRUCT_VERSION")}`,
        },
      },
      builds: [
        {
          id: "web",
          type: "web",
          engine: "@pipelab/plugin-construct/producer",
          input: { source: true },
          config: {},
          targets: [{ id: "web", config: { out: env("WEB_OUT") } }],
        },
        {
          // No explicit input: the planner wires it to the web build above.
          id: "desktop",
          type: "desktop",
          engine: "@pipelab/plugin-electron/producer",
          config: {},
          targets: [
            { id: "windows-x64", config: { out: env("DESKTOP_OUT") } },
            { id: "linux-x64", config: { out: env("UNUSED_TARGET") } },
          ],
        },
        {
          id: "unused",
          type: "desktop",
          engine: "@pipelab/plugin-electron/producer",
          input: { buildId: "web", targetId: "web" },
          config: {},
          targets: [{ id: "windows-x64", config: { out: env("UNUSED_BUILD") } }],
        },
      ],
      destinations: [
        {
          id: "off",
          provider: "@pipelab/plugin-itch/destination",
          enabled: false,
          config: { project: env("DISABLED_DESTINATION") },
          slots: [{ id: "s", enabled: true, config: { channel: env("DISABLED_SLOT") } }],
        },
        {
          id: "itch",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch-account", project: env("ITCH_PROJECT") },
          slots: [
            {
              id: "win",
              enabled: true,
              input: { buildId: "desktop", targetId: "windows-x64" },
              config: { channel: env("ITCH_CHANNEL") },
            },
            { id: "off", enabled: false, config: { channel: env("DISABLED_SLOT") } },
          ],
        },
      ],
    };

    it("lists what the run resolves: embedded references, required bindings and implicitly wired builds", () => {
      const names = getReleaseWorkflowEnvironmentVariableNames(config, registry, host);
      expect([...names].sort()).toEqual(
        [
          "PROJECT_PATH",
          "CONSTRUCT_VERSION", // embedded in a longer value
          "WEB_OUT", // required field of the implicitly wired web build
          "DESKTOP_OUT",
          "ITCH_PROJECT",
          "ITCH_CHANNEL",
        ].sort(),
      );
      expect(names).not.toContain("UNUSED_TARGET");
      expect(names).not.toContain("UNUSED_BUILD");
      expect(names).not.toContain("DISABLED_SLOT");
    });

    it("requires, from the same plan, the bindings of required fields only", () => {
      const { plan, config: resolved } = planReleaseForHost(config, registry, { host });
      expect(
        getReleaseWorkflowValueRequirements(resolved, plan, registry, builtInProviders)
          .requiredEnvironmentVariables,
      ).toEqual(
        expect.arrayContaining(["PROJECT_PATH", "WEB_OUT", "ITCH_PROJECT", "ITCH_CHANNEL"]),
      );
      expect(
        getReleaseWorkflowValueRequirements(resolved, plan, registry, builtInProviders)
          .requiredEnvironmentVariables,
      ).not.toContain("DESKTOP_OUT");
    });
  });
});
