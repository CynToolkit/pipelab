import { describe, expect, it } from "vitest";
import { buildReleaseRegistry, compileWorkflow, type ReleaseConfig } from "@pipelab/shared";
import construct from "@pipelab/plugin-construct";
import electron from "@pipelab/plugin-electron";
import godot from "@pipelab/plugin-godot";
import poki from "@pipelab/plugin-poki";
import steam from "@pipelab/plugin-steam";

const context = { host: { platform: "win32", architecture: "x64" } };

describe("release provider integration wiring", () => {
  it("connects Construct web output to Electron and Steam", () => {
    const config: ReleaseConfig = {
      version: "3.0.0", id: "construct-release", project: "project", name: "Construct release",
      source: { provider: "@pipelab/plugin-construct/source", config: { path: "/game.c3p", profilePath: "/profile" } },
      producers: [{ id: "electron", provider: "@pipelab/plugin-electron/producer", enabled: true, config: {}, targets: [{ id: "windows-x64", enabled: true, config: {} }] }],
      destinations: [{ id: "steam", provider: "@pipelab/plugin-steam/destination", enabled: true, config: { accountConnectionId: "steam", appId: "123" }, slots: [{ id: "windows", enabled: true, input: { producerId: "electron", outputId: "windows-x64" }, config: { depotId: "456" } }] }],
    };
    const workflow = compileWorkflow(config, buildReleaseRegistry([construct, electron, steam]), context);
    const electronStep = workflow.steps.find((step) => step.uses.includes("plugin-electron"));
    const steamStep = workflow.steps.find((step) => step.uses.includes("plugin-steam"));
    expect(electronStep?.artifactInputs?.["input-folder"]).toEqual({ stepId: "construct-source-extract", artifact: "output" });
    expect(electronStep?.with).toMatchObject({ platform: "win32", arch: "x64" });
    expect(steamStep?.artifactInputs?.folder).toEqual({ stepId: "electron-windows-x64", artifact: "electron-build" });
  });

  it("connects Godot web output to Poki", () => {
    const config: ReleaseConfig = {
      version: "3.0.0", id: "godot-release", project: "project", name: "Godot release",
      source: { provider: "@pipelab/plugin-godot/source", config: { path: "/game" } },
      producers: [{ id: "godot", provider: "@pipelab/plugin-godot/producer", enabled: true, config: { executable: "godot" }, targets: [{ id: "web", enabled: true, config: { preset: "Web" } }] }],
      destinations: [{ id: "poki", provider: "@pipelab/plugin-poki/destination", enabled: true, config: { project: "game", name: "1.0", notes: "release" }, slots: [{ id: "web", enabled: true, input: { producerId: "godot", outputId: "web" }, config: {} }] }],
    };
    const workflow = compileWorkflow(config, buildReleaseRegistry([godot, poki]), context);
    const godotStep = workflow.steps.find((step) => step.uses.includes("plugin-godot/godot:export"));
    const pokiStep = workflow.steps.find((step) => step.uses.includes("plugin-poki"));
    expect(godotStep?.with).toMatchObject({ preset: "Web", target: "web" });
    expect(pokiStep?.artifactInputs?.["input-folder"]).toEqual({ stepId: "godot-web", artifact: "output" });
  });
});
