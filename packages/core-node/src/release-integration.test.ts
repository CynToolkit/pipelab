import { describe, expect, it } from "vitest";
import {
  buildReleaseRegistry,
  compileWorkflow,
  planRelease,
  type ReleaseConfig,
} from "@pipelab/shared";
import construct from "@pipelab/plugin-construct";
import electron from "@pipelab/plugin-electron";
import godot from "@pipelab/plugin-godot";
import poki from "@pipelab/plugin-poki";
import steam from "@pipelab/plugin-steam";
import itch from "@pipelab/plugin-itch";
import { buildCoreReleaseRegistry } from "./release/registry";

const context = { host: { platform: "win32", architecture: "x64" } };

describe("release provider integration wiring", () => {
  it("maps real provider validation issues to indexed UI fields", () => {
    const plan = planRelease(
      {
        version: "3.0.0",
        id: "invalid-release",
        project: "project",
        name: "Invalid release",
        source: { provider: "@pipelab/plugin-construct/source", config: {} },
        builds: [],
        destinations: [
          {
            id: "steam",
            provider: "@pipelab/plugin-steam/destination",
            enabled: true,
            config: {},
            slots: [{ id: "windows", enabled: true, input: { source: true }, config: {} }],
          },
        ],
      },
      buildReleaseRegistry([construct, steam]),
      { host: context.host },
    );

    expect(plan.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "source.path",
        "source.profilePath",
        "destinations.0.config.accountConnectionId",
        "destinations.0.config.appId",
        "destinations.0.slots.0.config.depotId",
      ]),
    );
  });

  it("plans Construct directly to Poki without creating a build", () => {
    const config: ReleaseConfig = {
      version: "3.0.0",
      id: "construct-poki",
      project: "project",
      name: "Construct Poki",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: { path: "/game.c3p", profilePath: "/profile" },
      },
      builds: [],
      destinations: [
        {
          id: "poki",
          provider: "@pipelab/plugin-poki/destination",
          enabled: true,
          config: { project: "game", name: "1.0", notes: "release" },
          slots: [{ id: "web", enabled: true, input: { source: true }, config: {} }],
        },
      ],
    };
    const plan = planRelease(config, buildReleaseRegistry([construct, poki]), {
      host: context.host,
    });
    expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(plan.producers).toEqual([]);
    expect(plan.destinations[0]?.slots[0]?.input).toEqual({ source: true });
  });

  it("reports the unresolved Construct to Steam output without inventing a producer", () => {
    const config: ReleaseConfig = {
      version: "3.0.0",
      id: "construct-steam",
      project: "project",
      name: "Construct Steam",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: { path: "/game.c3p", profilePath: "/profile" },
      },
      builds: [],
      destinations: [
        {
          id: "steam",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: { accountConnectionId: "steam", appId: "123" },
          slots: [{ id: "windows", enabled: true, config: { depotId: "456" } }],
        },
      ],
    };
    const plan = planRelease(config, buildReleaseRegistry([construct, steam]), {
      host: context.host,
    });
    expect(plan.producers).toEqual([]);
    expect(
      plan.issues.some(
        (issue) =>
          issue.code === "release.destination.input.required" &&
          issue.path === "destinations.0.slots.0.input",
      ),
    ).toBe(true);
  });

  it("connects Construct web output to Electron and Steam", () => {
    const config: ReleaseConfig = {
      version: "3.0.0",
      id: "construct-release",
      project: "project",
      name: "Construct release",
      source: {
        provider: "@pipelab/plugin-construct/source",
        config: { path: "/game.c3p", profilePath: "/profile" },
      },
      builds: [
        {
          id: "electron",
          type: "desktop",
          engine: "@pipelab/plugin-electron/producer",
          enabled: true,
          config: {},
          targets: [{ id: "windows-x64", enabled: true, config: {} }],
        },
      ],
      destinations: [
        {
          id: "steam",
          provider: "@pipelab/plugin-steam/destination",
          enabled: true,
          config: { accountConnectionId: "steam", appId: "123" },
          slots: [
            {
              id: "windows",
              enabled: true,
              input: { buildId: "electron", targetId: "windows-x64" },
              config: { depotId: "456" },
            },
          ],
        },
      ],
    };
    const workflow = compileWorkflow(
      config,
      buildReleaseRegistry([construct, electron, steam]),
      context,
    );
    const electronStep = workflow.steps.find((step) => step.uses.includes("plugin-electron"));
    const steamStep = workflow.steps.find((step) => step.uses.includes("plugin-steam"));
    expect(electronStep?.artifactInputs?.["input-folder"]).toEqual({
      stepId: "construct-source-extract",
      artifact: "output",
    });
    expect(electronStep?.with).toMatchObject({ platform: "win32", arch: "x64" });
    expect(steamStep?.artifactInputs?.folder).toEqual({
      stepId: "electron-windows-x64",
      artifact: "electron-build",
    });
  });

  it("connects Godot web output to Poki", () => {
    const config: ReleaseConfig = {
      version: "3.0.0",
      id: "godot-release",
      project: "project",
      name: "Godot release",
      source: { provider: "@pipelab/plugin-godot/source", config: { path: "/game" } },
      builds: [
        {
          id: "godot",
          type: "web",
          engine: "@pipelab/plugin-godot/producer",
          enabled: true,
          config: { executable: "godot" },
          targets: [{ id: "web", enabled: true, config: { preset: "Web" } }],
        },
      ],
      destinations: [
        {
          id: "poki",
          provider: "@pipelab/plugin-poki/destination",
          enabled: true,
          config: { project: "game", name: "1.0", notes: "release" },
          slots: [
            { id: "web", enabled: true, input: { buildId: "godot", targetId: "web" }, config: {} },
          ],
        },
      ],
    };
    const workflow = compileWorkflow(config, buildReleaseRegistry([godot, poki]), context);
    const godotStep = workflow.steps.find((step) =>
      step.uses.includes("plugin-godot/godot:export"),
    );
    const pokiStep = workflow.steps.find((step) => step.uses.includes("plugin-poki"));
    expect(godotStep?.with).toMatchObject({ preset: "Web", target: "web" });
    expect(pokiStep?.artifactInputs?.["input-folder"]).toEqual({
      stepId: "godot-web",
      artifact: "output",
    });
  });

  it("connects a Web folder source directly to Poki", () => {
    const config: ReleaseConfig = {
      version: "3.0.0",
      id: "web-direct",
      project: "project",
      name: "Web direct",
      source: {
        provider: "@pipelab/plugin-filesystem/web-folder-source",
        config: { path: "/web" },
      },
      builds: [],
      destinations: [
        {
          id: "poki",
          provider: "@pipelab/plugin-poki/destination",
          enabled: true,
          config: { project: "game", name: "1.0", notes: "release" },
          slots: [{ id: "web", enabled: true, input: { source: true }, config: {} }],
        },
      ],
    };
    const workflow = compileWorkflow(config, buildCoreReleaseRegistry([poki]), context);
    expect(
      workflow.steps.find((step) => step.uses.includes("plugin-poki"))?.artifactInputs?.[
        "input-folder"
      ],
    ).toEqual({ stepId: "release-web-folder-source", artifact: "output" });
  });

  it("keeps a generic ZIP source semantically generic", () => {
    const config: ReleaseConfig = {
      version: "3.0.0",
      id: "zip-direct",
      project: "project",
      name: "ZIP direct",
      source: { provider: "@pipelab/plugin-filesystem/zip-source", config: { path: "/game.zip" } },
      builds: [],
      destinations: [
        {
          id: "itch",
          provider: "@pipelab/plugin-itch/destination",
          enabled: true,
          config: { accountConnectionId: "itch", project: "owner/game" },
          slots: [
            { id: "zip", enabled: true, input: { source: true }, config: { channel: "html5" } },
          ],
        },
      ],
    };
    const workflow = compileWorkflow(config, buildCoreReleaseRegistry([itch]), context);
    expect(
      workflow.steps.find((step) => step.uses.includes("plugin-itch"))?.artifactInputs?.[
        "input-folder"
      ],
    ).toEqual({ stepId: "@pipelab/plugin-filesystem/zip-source-source", artifact: "output" });
  });
});
