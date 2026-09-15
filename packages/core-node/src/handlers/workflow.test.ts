import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createWorkflowDefinition } from "./workflow";

describe("createWorkflowDefinition", () => {
  it("builds parallel web and itch branches from a built folder", async () => {
    const workspace = await mkdtemp(join(process.cwd(), ".workflow-test-"));
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ user: { username: "resolved-user" } }), { status: 200 })),
      );
      const source = join(workspace, "build");
      await mkdir(source);
      const { workflow, variables } = await createWorkflowDefinition(
        {
          version: "1.0.0",
          id: "workflow",
          project: "project",
          name: "Publish",
          source: { type: "folder", path: source },
          destinations: [
            { type: "web", outputDir: join(workspace, "web"), overwrite: true, cleanup: false },
            {
              type: "itch",
              accountConnectionId: "itch-account",
              project: "game",
              channel: "web",
            },
          ],
        },
        new Map([
          [
            "itch-account",
            {
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              apiKey: "secret",
            },
          ],
          [
            "other-itch-account",
            {
              pluginName: "@pipelab/plugin-itch",
              integrationName: "Itch Butler Account",
              apiKey: "other-secret",
              isDefault: true,
            },
          ],
        ]),
      );

      expect(variables).toMatchObject({ sourcePath: source });
      expect(workflow.continueOnError).toBe(true);
      expect(workflow.steps.map((step) => step.id)).toEqual(["web", "itch"]);
      expect(workflow.steps.map((step) => step.needs)).toEqual([[], []]);
      expect(workflow.steps[1].with).toMatchObject({
        user: "resolved-user",
        "api-key": "${{ variables.itchApiKey }}",
      });
      expect(variables).toMatchObject({ itchApiKey: "secret" });
    } finally {
      vi.unstubAllGlobals();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses release metadata once for Steam packaging and upload", async () => {
    const workspace = await mkdtemp(join(process.cwd(), ".workflow-test-"));
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ user: { username: "resolved-user" } }), { status: 200 })),
      );
      const source = join(workspace, "build");
      await mkdir(source);
      await writeFile(join(source, "icon.png"), "icon");
      const { workflow, variables } = await createWorkflowDefinition(
        {
          version: "1.0.0",
          id: "workflow",
          project: "project",
          name: "My Game",
          source: { type: "folder", path: source },
          destinations: [
            {
              type: "steam",
              accountConnectionId: "steam-account",
              appId: "123",
              depotId: "456",
            },
          ],
        },
        new Map([
          ["steam-account", { username: "player", password: "secret" }],
        ]),
        undefined,
        { version: "2.3.4", description: "Release candidate" },
      );

      expect(workflow.steps[0].with).toMatchObject({
        name: "My Game",
        appBundleId: "com.pipelab.my.game",
        appVersion: "2.3.4",
        description: "Release candidate",
        icon: join(source, "icon.png"),
      });
      expect(workflow.steps[1].with).toMatchObject({
        appId: "123",
        depotId: "456",
        description: "Release candidate",
      });
      expect(variables).toMatchObject({ steamUsername: "player", steamPassword: "secret" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not schedule inactive destinations", async () => {
    const workspace = await mkdtemp(join(process.cwd(), ".workflow-test-"));
    try {
      const source = join(workspace, "build");
      await mkdir(source);
      const { workflow } = await createWorkflowDefinition(
        {
          version: "1.0.0",
          id: "workflow",
          project: "project",
          name: "Publish",
          source: { type: "folder", path: source },
          destinations: [
            { type: "web", enabled: false, outputDir: join(workspace, "web"), overwrite: false, cleanup: false },
            {
              type: "itch",
              enabled: true,
              accountConnectionId: "itch-account",
              project: "game",
              channel: "web",
            },
          ],
        },
        new Map([
          [
            "itch-account",
            { pluginName: "@pipelab/plugin-itch", integrationName: "Itch Butler Account", apiKey: "secret" },
          ],
        ]),
      );

      expect(workflow.steps.map((step) => step.id)).toEqual(["itch"]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
