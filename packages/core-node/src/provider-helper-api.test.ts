import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fetchPackage,
  runPnpm,
  runWithLiveLogs,
  resolveBundledAsset,
  type ProviderHostContext,
  type PipelabContext as ProviderContextAlias,
} from "@pipelab/plugin-core";
import { PipelabContext } from "./context";

let workspace: string;
let context: PipelabContext;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "provider-helper-api-"));
  context = new PipelabContext({ userDataPath: workspace });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(workspace, { recursive: true, force: true });
});

describe("public provider helper API", () => {
  it("exports the surviving helpers and structural context compatibility alias", () => {
    const host: ProviderHostContext = context;
    const options: Parameters<typeof fetchPackage>[2] = { context: host };
    expectTypeOf<ProviderContextAlias>().toEqualTypeOf<ProviderHostContext>();
    expect(options.context).toBe(context);
    for (const helper of [fetchPackage, runPnpm, runWithLiveLogs, resolveBundledAsset])
      expect(helper).toBeTypeOf("function");
  });

  it("executes pnpm through host-provided executables and paths", async () => {
    const script = join(workspace, "pnpm.cjs");
    await writeFile(
      script,
      "console.log(JSON.stringify({ args: process.argv.slice(2), home: process.env.PNPM_HOME }))",
    );
    const node = vi.spyOn(context, "ensureNodeJS").mockResolvedValue(process.execPath);
    const pnpm = vi.spyOn(context, "ensurePNPM").mockResolvedValue(script);
    const result = await runPnpm(workspace, { args: ["--version"], context });
    expect(JSON.parse(result.all ?? "")).toEqual({
      args: ["--version"],
      home: context.getPnpmPath(),
    });
    expect(node).toHaveBeenCalledOnce();
    expect(pnpm).toHaveBeenCalledOnce();
  });

  it("propagates cancellation through pnpm execution", async () => {
    const script = join(workspace, "pnpm.cjs");
    await writeFile(script, "setInterval(() => {}, 1000)");
    vi.spyOn(context, "ensureNodeJS").mockResolvedValue(process.execPath);
    vi.spyOn(context, "ensurePNPM").mockResolvedValue(script);
    const controller = new AbortController();
    controller.abort();
    await expect(runPnpm(workspace, { context, signal: controller.signal })).rejects.toMatchObject({
      isCanceled: true,
    });
  });

  it("streams execution output through the public hooks", async () => {
    let stdout = "";
    let stderr = "";
    const exit = vi.fn();
    await runWithLiveLogs(
      process.execPath,
      ["-e", "console.log('stdout'); console.error('stderr')"],
      {},
      () => {},
      {
        onStdout: (data) => {
          stdout += data;
        },
        onStderr: (data) => {
          stderr += data;
        },
        onExit: exit,
      },
    );
    expect(stdout).toContain("stdout");
    expect(stderr).toContain("stderr");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("cancels a running subprocess through the public helper", async () => {
    const controller = new AbortController();
    await expect(
      runWithLiveLogs(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        {},
        () => {},
        {
          onCreated: () => controller.abort(),
        },
        controller.signal,
      ),
    ).rejects.toThrow(/abort|cancel/i);
  });

  it.each(["electron", "tauri"])(
    "resolves bundled %s assets through the explicit host",
    async (provider) => {
      const resolver = vi.spyOn(context, "resolveBundledAsset");
      const name = `@pipelab/asset-${provider}`;
      const folder = await resolveBundledAsset(name, context);
      await expect(access(join(folder, "package.json"))).resolves.toBeUndefined();
      await expect(access(join(folder, "template"))).resolves.toBeUndefined();
      expect(resolver).toHaveBeenCalledWith(name);
    },
  );
});
