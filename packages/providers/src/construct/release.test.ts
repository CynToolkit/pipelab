import { describe, expect, it } from "vitest";
import plugin, { constructSource } from "./index";
import { constructProducer } from "./producer";

describe("Construct release validation", () => {
  it("declares the provider-owned Construct Account Connection schema", () => {
    expect(plugin.integrations).toContainEqual({
      name: "Construct Account",
      fields: [
        { key: "username", label: "Username", type: "text" },
        { key: "password", label: "Password", type: "password" },
      ],
    });
    expect(constructSource.fields).toContainEqual(
      expect.objectContaining({
        key: "accountConnectionId",
        type: "connection",
        integration: "Construct Account",
        required: false,
      }),
    );
    expect(constructSource.createDefaultConfig()).toHaveProperty("accountConnectionId", "");
  });

  it("keeps the Release source and workflow task without legacy node metadata", () => {
    expect("nodes" in plugin).toBe(false);
    expect(plugin.release?.sources?.map((source) => source.id)).toContain(constructSource.id);
    expect(Object.keys(plugin.workflowTasks ?? {})).toEqual([
      "@pipelab/plugin-construct/export-construct-project",
    ]);
  });

  it("tags the Construct source output as a Construct project file", () => {
    expect(constructSource.output).toEqual({
      kind: "project",
      technology: "construct",
      container: "file",
    });
  });

  it("declares the Construct web target as a web build target without declaring a default", () => {
    expect(constructSource).not.toHaveProperty("webBuild");
    expect(constructProducer.planning.mode).toBe("build");
    expect(constructProducer.targets).toContainEqual(
      expect.objectContaining({ id: "web", buildType: "web" }),
    );
  });

  it("declares no default on any Construct target", () => {
    expect(constructProducer.targets.length).toBeGreaterThan(0);
    for (const target of constructProducer.targets) {
      expect(target).not.toHaveProperty("defaultFor");
    }
  });

  it("compiles the source to a passthrough of the project path without exporting", () => {
    const compiled = constructSource.compile(
      {
        path: "/projects/game.c3p",
        profilePath: "/profiles/construct",
        accountConnectionId: "",
        version: "",
      },
      { host: { platform: "linux", architecture: "x64" } },
    );
    expect(compiled.steps).toEqual([
      {
        id: "release-construct-source",
        uses: "@pipelab/core/passthrough",
        with: { path: "/projects/game.c3p" },
        artifacts: { output: { descriptor: constructSource.output } },
      },
    ]);
    expect(compiled.artifact).toEqual({
      reference: { stepId: "release-construct-source", artifact: "output" },
      descriptor: constructSource.output,
    });
  });

  it("reports source field paths", () => {
    expect(constructSource.validate({})).toEqual([
      expect.objectContaining({ path: "path" }),
      expect.objectContaining({ path: "profilePath" }),
    ]);
  });
});

describe("Construct producer", () => {
  const context = {
    host: { platform: "linux", architecture: "x64" } as const,
    sourceConfig: {
      path: "/projects/game.c3p",
      profilePath: "/profiles/construct",
      accountConnectionId: "construct-production",
      version: "latest",
    },
  };
  const input = {
    reference: { stepId: "release-construct-source", artifact: "output" },
    descriptor: constructSource.output,
  };
  const producerConfig = (enabledTargetIds: string[]) => ({
    id: "construct",
    provider: constructProducer.id,
    enabled: true,
    targets: constructProducer.targets.map((target) => ({
      id: target.id,
      enabled: enabledTargetIds.includes(target.id),
      config: target.createDefaultConfig(),
    })),
    config: {},
  });
  const target = (id: string) => {
    const found = constructProducer.targets.find((item) => item.id === id);
    if (!found) throw new Error(`Missing target ${id}`);
    return found;
  };

  it("is registered with the Construct provider and accepts only Construct project files", () => {
    expect(plugin.release?.producers).toContainEqual(constructProducer);
    expect(constructProducer).toMatchObject({
      id: "@pipelab/plugin-construct/producer",
      label: "Construct",
      planning: { mode: "build" },
      accepts: { kind: "project", technology: "construct" },
    });
  });

  it("declares the web target and the three desktop targets with their descriptors", () => {
    expect(
      constructProducer.targets.map((item) => ({
        id: item.id,
        buildType: item.buildType,
        output: item.output,
      })),
    ).toEqual([
      {
        id: "web",
        buildType: "web",
        output: {
          kind: "application",
          technology: "construct",
          platform: "web",
          container: "directory",
        },
      },
      {
        id: "webview2-windows-x64",
        buildType: "desktop",
        output: {
          kind: "application",
          technology: "webview2",
          platform: "windows",
          architecture: "x64",
          container: "directory",
        },
      },
      {
        id: "wkwebview-macos-arm64",
        buildType: "desktop",
        output: {
          kind: "application",
          technology: "wkwebview",
          platform: "macos",
          architecture: "arm64",
          container: "directory",
        },
      },
      {
        id: "cef-linux-x64",
        buildType: "desktop",
        output: {
          kind: "application",
          technology: "cef",
          platform: "linux",
          architecture: "x64",
          container: "directory",
        },
      },
    ]);
  });

  it("makes the web target available and the desktop targets unavailable for now", () => {
    expect(target("web").isAvailable?.(context.host)).toEqual({ available: true });
    expect(target("web").fields ?? []).toEqual([]);
    for (const id of ["webview2-windows-x64", "wkwebview-macos-arm64", "cef-linux-x64"]) {
      expect(target(id).isAvailable?.(context.host)).toEqual({
        available: false,
        reason: "Construct desktop exports are not available yet",
      });
    }
  });

  it("exports the web target with exportType web and unzips it into the web artifact", () => {
    const compiled = constructProducer.compile(input, producerConfig(["web"]), context);
    expect(compiled.steps).toEqual([
      {
        id: "construct-web-export",
        uses: "@pipelab/plugin-construct/export-construct-project",
        with: {
          file: "/projects/game.c3p",
          customProfile: "/profiles/construct",
          version: "latest",
          accountConnectionId: "construct-production",
          exportType: "web",
        },
        artifacts: {
          zipFile: {
            descriptor: {
              kind: "files",
              technology: "construct",
              container: "archive",
              format: "zip",
            },
          },
        },
      },
      {
        id: "construct-web-extract",
        uses: "@pipelab/core/archive/unzip",
        needs: ["construct-web-export"],
        artifactInputs: { file: { stepId: "construct-web-export", artifact: "zipFile" } },
        artifacts: { output: { descriptor: target("web").output } },
      },
    ]);
    expect(compiled.artifacts).toEqual({
      web: {
        reference: { stepId: "construct-web-extract", artifact: "output" },
        descriptor: target("web").output,
      },
    });
  });

  it("exports each enabled desktop target with its exportType and unzips it into the target artifact", () => {
    const compiled = constructProducer.compile(
      input,
      producerConfig(["webview2-windows-x64", "cef-linux-x64"]),
      context,
    );
    expect(compiled.steps).toEqual([
      expect.objectContaining({
        id: "construct-webview2-windows-x64-export",
        uses: "@pipelab/plugin-construct/export-construct-project",
        with: expect.objectContaining({ exportType: "webview2", file: "/projects/game.c3p" }),
      }),
      expect.objectContaining({
        id: "construct-webview2-windows-x64-extract",
        uses: "@pipelab/core/archive/unzip",
        needs: ["construct-webview2-windows-x64-export"],
        artifacts: { output: { descriptor: target("webview2-windows-x64").output } },
      }),
      expect.objectContaining({
        id: "construct-cef-linux-x64-export",
        with: expect.objectContaining({ exportType: "cef" }),
      }),
      expect.objectContaining({ id: "construct-cef-linux-x64-extract" }),
    ]);
    expect(Object.keys(compiled.artifacts)).toEqual(["webview2-windows-x64", "cef-linux-x64"]);
    expect(compiled.artifacts["cef-linux-x64"]).toEqual({
      reference: { stepId: "construct-cef-linux-x64-extract", artifact: "output" },
      descriptor: target("cef-linux-x64").output,
    });
  });

  it("exports the web target once when web and desktop targets are enabled together", () => {
    const compiled = constructProducer.compile(
      input,
      producerConfig(["web", "wkwebview-macos-arm64"]),
      context,
    );
    const ids = compiled.steps.map((step) => step.id);
    expect(ids.filter((id) => id === "construct-web-export")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(compiled.artifacts)).toEqual(["web", "wkwebview-macos-arm64"]);
  });

  it("requires the Construct source configuration at compile time", () => {
    expect(() =>
      constructProducer.compile(input, producerConfig(["web"]), { host: context.host }),
    ).toThrow(/Construct project source/);
  });
});
