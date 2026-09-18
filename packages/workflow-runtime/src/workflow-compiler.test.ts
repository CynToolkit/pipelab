import { describe, expect, it } from "vitest";
import { compileWorkflow } from "./workflow-compiler";

describe("compileWorkflow", () => {
  it("propagates the configured failure policy and keeps the default", () => {
    const base = { version: "2.0.0" as const, source: { type: "folder" as const, path: "/game" }, packagers: [], destinations: [] };
    expect(compileWorkflow({ ...base, continueOnError: false }).continueOnError).toBe(false);
    expect(compileWorkflow(base).continueOnError).toBe(true);
  });

  it("passes the explicitly selected Construct profile to the source exporter", () => {
    const workflow = compileWorkflow({
      version: "2.0.0",
      source: { type: "construct3", path: "/game.c3p", profilePath: "/browser/Construct/Default" },
      packagers: [],
      destinations: [],
    });

    expect(workflow.steps[0]).toMatchObject({
      id: "source-export",
      uses: "construct:export",
      with: { file: "${{ variables.sourcePath }}", customProfile: "/browser/Construct/Default" },
    });
  });

  it("produces each packager output once and gives every slot its exact producer", () => {
    const workflow = compileWorkflow({
      version: "2.0.0",
      source: { type: "folder", path: "/game" },
      packagers: [
        { id: "electron-linux", definitionId: "electron", enabled: true, config: { targets: ["electron.linux"] } },
        { id: "tauri-windows", definitionId: "tauri", enabled: true, config: { targets: ["tauri.windows"] } },
      ],
      destinations: [{ id: "steam", serviceId: "steam", enabled: true, config: {}, slots: [
        { id: "linux", config: { depotId: "depot-linux" }, input: { packagerId: "electron-linux", outputId: "electron.linux" } },
        { id: "windows", config: { depotId: "depot-windows" }, input: { packagerId: "tauri-windows", outputId: "tauri.windows" } },
      ] }],
    });
    expect(workflow.steps.filter((step) => step.uses.endsWith(":bundle"))).toHaveLength(2);
    expect(workflow.steps.filter((step) => step.uses === "steam:upload").map((step) => step.needs)).toEqual([
      ["packager-electron-linux-electron-linux"], ["packager-tauri-windows-tauri-windows"],
    ]);
    expect(workflow.steps.filter((step) => step.uses === "steam:upload").map((step) => step.with?.depotId)).toEqual(["depot-linux", "depot-windows"]);
    expect(workflow.steps.filter((step) => step.uses === "steam:upload").map((step) => step.delivery?.producerStep)).toEqual([
      "packager-electron-linux-electron-linux", "packager-tauri-windows-tauri-windows",
    ]);
  });

  it("keeps same-type packager outputs distinct for their configured slots", () => {
    const workflow = compileWorkflow({
      version: "2.0.0", source: { type: "folder", path: "/game" },
      packagers: [
        { id: "electron-a", definitionId: "electron", enabled: true, config: { targets: ["electron.windows"] } },
        { id: "electron-b", definitionId: "electron", enabled: true, config: { targets: ["electron.windows"] } },
      ],
      destinations: [{ id: "steam", serviceId: "steam", enabled: true, config: {}, slots: [
        { id: "a", config: {}, input: { packagerId: "electron-a", outputId: "electron.windows" } },
        { id: "b", config: {}, input: { packagerId: "electron-b", outputId: "electron.windows" } },
      ] }],
    });
    expect(workflow.steps.filter((step) => step.delivery).map((step) => step.delivery)).toEqual([
      expect.objectContaining({ artifactOutputId: "electron.windows", producerStep: "packager-electron-a-electron-windows" }),
      expect.objectContaining({ artifactOutputId: "electron.windows", producerStep: "packager-electron-b-electron-windows" }),
    ]);
  });

  it("preserves the single-packager delivery mapping", () => {
    const workflow = compileWorkflow({
      version: "2.0.0", source: { type: "folder", path: "/game" },
      packagers: [{ id: "electron", definitionId: "electron", enabled: true, config: { targets: ["electron.windows"] } }],
      destinations: [{ id: "steam", serviceId: "steam", enabled: true, config: {}, slots: [
        { id: "windows", config: {}, input: { packagerId: "electron", outputId: "electron.windows" } },
      ] }],
    });
    expect(workflow.steps.find((step) => step.delivery)).toMatchObject({
      needs: ["packager-electron-electron-windows"],
      delivery: { artifactOutputId: "electron.windows", producerStep: "packager-electron-electron-windows" },
    });
  });

  it("uses the folder configured on a web-folder slot", () => {
    const workflow = compileWorkflow({
      version: "2.0.0",
      source: { type: "folder", path: "/game" },
      packagers: [{ id: "web", definitionId: "web", enabled: true, config: { targets: ["web.html5"] } }],
      destinations: [{ id: "docs", serviceId: "web-folder", enabled: true, config: {}, slots: [
        { id: "html", config: { outputDir: "/publish/site" }, input: { packagerId: "web", outputId: "web.html5" } },
      ] }],
    });
    expect(workflow.steps.find((step) => step.id === "delivery-docs-html")?.with?.to).toBe("/publish/site");
    expect(workflow.steps.find((step) => step.id === "delivery-docs-html")?.delivery).toEqual({
      destinationId: "docs",
      serviceId: "web-folder",
      destinationName: "Folder",
      slotId: "html",
      artifactOutputId: "web.html5",
      producerStep: "packager-web-web-html5",
    });
  });

  it("does not schedule delivery for disabled slots", () => {
    const workflow = compileWorkflow({
      version: "2.0.0",
      source: { type: "folder", path: "/game" },
      packagers: [{ id: "web", definitionId: "web", enabled: true, config: { targets: ["web.html5"] } }],
      destinations: [{ id: "folder-output", serviceId: "web-folder", enabled: true, config: {}, slots: [
        { id: "disabled", enabled: false, config: { outputDir: "/publish/disabled" }, input: { packagerId: "web", outputId: "web.html5" } },
        { id: "enabled", enabled: true, config: { outputDir: "/publish/enabled" }, input: { packagerId: "web", outputId: "web.html5" } },
      ] }],
    });
    expect(workflow.steps.filter((step) => step.uses === "filesystem:copy").map((step) => step.id)).toEqual(["delivery-folder-output-enabled"]);
  });

  it("compiles a ZIP destination as a delivery task using the slot path", () => {
    const workflow = compileWorkflow({
      version: "2.0.0",
      source: { type: "folder", path: "/game" },
      packagers: [{ id: "web", definitionId: "web", enabled: true, config: { targets: ["web.html5"] } }],
      destinations: [{ id: "zip-output", serviceId: "zip", enabled: true, config: {}, slots: [
        { id: "html", config: { outputPath: "/publish/game.zip" }, input: { packagerId: "web", outputId: "web.html5" } },
      ] }],
    });
    expect(workflow.steps.find((step) => step.id === "delivery-zip-output-html")).toMatchObject({
      uses: "filesystem:zip",
      needs: ["packager-web-web-html5"],
      with: { to: "/publish/game.zip" },
    });
  });

  it("compiles Pipelab Cloud as an artifact upload destination", () => {
    const workflow = compileWorkflow({
      version: "2.0.0",
      source: { type: "folder", path: "/game" },
      packagers: [{ id: "web", definitionId: "web", enabled: true, config: { targets: ["web.html5"] } }],
      destinations: [{ serviceId: "pipelab-cloud", id: "cloud", enabled: true, config: {}, slots: [
        { id: "html", config: {}, input: { packagerId: "web", outputId: "web.html5" } },
      ] }],
    });

    expect(workflow.steps.find((step) => step.id === "delivery-cloud-html")).toMatchObject({
      uses: "pipelab-cloud:upload",
      needs: ["packager-web-web-html5"],
      delivery: {
        destinationId: "cloud",
        slotId: "html",
        artifactOutputId: "web.html5",
      },
    });
  });
});
