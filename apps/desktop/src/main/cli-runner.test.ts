import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { getLocalCliRunner } from "./cli-runner";

describe("getLocalCliRunner", () => {
  it("resolves tsx's JavaScript entry point from Desktop instead of the platform shim", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const { args } = getLocalCliRunner(projectRoot, entryPoint, "linux", "electron");

    assert.equal(
      args[0],
      createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx/cli"),
    );
    assert.match(args[0]!, /[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
    assert.equal(args[1], entryPoint);
    assert.equal(args[2], "serve");
    assert.doesNotMatch(args[0]!, /node_modules[\\/]\.bin[\\/]tsx$/);
  });

  it("uses the installed Node runtime for the local CLI on Windows", () => {
    const result = getLocalCliRunner(undefined, "apps/cli/src/index.ts", "win32", "electron.exe");
    assert.equal(result.executable, "node.exe");
    assert.deepEqual(result.args, ["--import", "tsx", "apps/cli/src/index.ts", "serve"]);
  });

  it("uses the resolved tsx loader with Node directly on Windows", () => {
    const projectRoot = resolve(process.cwd(), "../..");
    const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
    const { executable, args } = getLocalCliRunner(
      projectRoot,
      entryPoint,
      "win32",
      "electron.exe",
    );

    assert.equal(executable, "node.exe");
    assert.equal(args[0], "--import");
    assert.equal(
      args[1],
      pathToFileURL(
        createRequire(join(projectRoot, "apps", "desktop", "package.json")).resolve("tsx"),
      ).href,
    );
    assert.equal(args[2], entryPoint);
    assert.equal(args[3], "serve");
  });

  it(
    "starts the local TypeScript CLI on Windows",
    { skip: process.platform !== "win32" },
    async () => {
      const projectRoot = resolve(process.cwd(), "../..");
      const entryPoint = join(projectRoot, "apps", "cli", "src", "index.ts");
      const { executable, args } = getLocalCliRunner(
        projectRoot,
        entryPoint,
        process.platform,
        process.execPath,
      );
      const userDataPath = await mkdtemp(join(tmpdir(), "pipelab-desktop-cli-runner-"));
      const sessionId = randomUUID();
      const secret = Buffer.alloc(32, 1).toString("base64url");
      const child = spawn(
        executable,
        [...args, "--port", "0", "--host", "127.0.0.1", "--user-data", userDataPath],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: undefined,
            IS_SERVER: "true",
            NODE_ENV: "development",
            PIPELAB_DESKTOP_BOOTSTRAP_SECRET: secret,
            PIPELAB_DESKTOP_SESSION_ID: sessionId,
            PORT: "0",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let output = "";
      let timer: NodeJS.Timeout | undefined;
      try {
        await new Promise<void>((resolveReady, rejectReady) => {
          const finish = (error?: Error) => {
            if (timer) clearTimeout(timer);
            if (error) rejectReady(error);
            else resolveReady();
          };
          timer = setTimeout(
            () => finish(new Error(`Windows CLI did not announce readiness. Output: ${output}`)),
            30_000,
          );
          child.stdout.on("data", (chunk: Buffer | string) => {
            output += chunk.toString();
            if (output.includes(`PIPELAB_DESKTOP_READY:`)) finish();
          });
          child.stderr.on("data", (chunk: Buffer | string) => {
            output += chunk.toString();
          });
          child.once("error", (error) => finish(error));
          child.once("exit", (code) =>
            finish(new Error(`Windows CLI exited before readiness (${code}). Output: ${output}`)),
          );
        });
        assert.match(output, new RegExp(sessionId));
      } finally {
        child.kill();
        await new Promise<void>((resolveClose) => {
          if (child.exitCode !== null || child.signalCode !== null) resolveClose();
          else child.once("close", () => resolveClose());
        });
        await rm(userDataPath, { recursive: true, force: true });
      }
    },
  );
});
