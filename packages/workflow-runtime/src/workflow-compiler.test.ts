import { describe, expect, it } from "vitest";
import { compileWorkflow } from "./workflow-compiler";

describe("compileWorkflow", () => {
  it("creates one producer per stable output and fans destinations out from producers", () => {
    const workflow = compileWorkflow({
      version: "1.4.0",
      source: { type: "folder", path: "/game" },
      outputs: ["electron.windows", "electron.linux", "web.html5"],
      destinations: [
        { id: "steam", enabled: true },
        { id: "itch", enabled: true },
        { id: "poki", enabled: true },
      ],
    });

    expect(workflow.steps.map((step) => step.id)).toEqual([
      "source-export",
      "prebundle",
      "packager-electron-windows",
      "packager-electron-linux",
      "packager-web-html5",
      "destination-steam",
      "destination-itch",
      "destination-poki",
    ]);
    expect(workflow.steps.at(-3)?.needs).toEqual([
      "packager-electron-windows",
      "packager-electron-linux",
    ]);
    expect(workflow.steps.at(-2)?.needs).toEqual([
      "packager-electron-windows",
      "packager-electron-linux",
      "packager-web-html5",
    ]);
    expect(workflow.steps.at(-1)?.needs).toEqual(["packager-web-html5"]);
    expect(workflow.steps[2].with).toMatchObject({
      outputId: "electron.windows",
      version: "${{ variables.version }}",
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
      slotId: "html",
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
});
