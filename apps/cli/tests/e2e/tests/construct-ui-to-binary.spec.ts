import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, test } from "vitest";
import { BuildHistoryStorage, PipelabContext } from "@pipelab/core-node";
import { runCLI } from "@pipelab/test-utils";

const repoRoot = resolve(process.cwd(), "../..");
const browserJourneyPath = join(repoRoot, "apps/ui/tests/browser/first-run-onboarding.cjs");
const constructExportFixturePath = resolve(process.cwd(), "tests/e2e/fixtures/construct-export");
const playwrightRequire = createRequire(join(repoRoot, "apps/website/package.json"));
const { chromium } = playwrightRequire("playwright") as typeof import("playwright");

type StartedProcess = {
  child: ChildProcessWithoutNullStreams;
  output: string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

const startProcess = (command: string, args: string[], env: NodeJS.ProcessEnv): StartedProcess => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const appendOutput = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-20_000);
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolveExit({ code, signal }));
    },
  );
  return {
    child,
    exited,
    get output() {
      return output;
    },
  };
};

const stopProcess = async (processHandle: StartedProcess | undefined) => {
  if (!processHandle || processHandle.child.exitCode !== null) return;
  const { child } = processHandle;
  const killWindowsProcessTree = async () => {
    if (!child.pid) return;
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    const completed = new Promise<void>((resolveKill) => {
      killer.once("error", () => resolveKill());
      killer.once("close", () => resolveKill());
    });
    const finished = await Promise.race([
      completed.then(() => true),
      delay(5000).then(() => false),
    ]);
    if (!finished) killer.kill("SIGKILL");
  };
  if (process.platform === "win32") {
    await killWindowsProcessTree();
  } else if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  const stopped = await Promise.race([
    processHandle.exited.then(() => true),
    delay(5000).then(() => false),
  ]);
  if (!stopped && child.pid) {
    if (process.platform === "win32") {
      await killWindowsProcessTree();
      child.kill("SIGKILL");
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
    await Promise.race([processHandle.exited, delay(5000)]);
  }
};

const getAvailablePort = async () => {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate a local port.");
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
};

const waitForHttp = async (url: string, processHandle: StartedProcess) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null)
      throw new Error(
        `UI dev server exited before becoming ready (code ${processHandle.child.exitCode}):\n${processHandle.output}`,
      );
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(200);
  }
  throw new Error(`UI dev server did not become ready within 60 seconds:\n${processHandle.output}`);
};

const waitForJsonFile = async (path: string, processHandle: StartedProcess) => {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null)
      throw new Error(
        `Browser journey exited before requesting Ship (code ${processHandle.child.exitCode}):\n${processHandle.output}`,
      );
    try {
      return JSON.parse(await readFile(path, "utf8")) as {
        workflowId: string;
        workflowName: string;
        projectId: string;
      };
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for the Dashboard Ship action:\n${processHandle.output}`);
};

const waitForDevTools = async (url: string, timeoutMs: number, processHandle: StartedProcess) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null)
      throw new Error(
        `Packaged Electron exited before opening DevTools (code ${processHandle.child.exitCode}):\n${processHandle.output}`,
      );
    try {
      const response = await fetch(url);
      if (response.ok) return (await response.json()) as Array<{ type: string; title: string }>;
    } catch {
      // Electron is still starting.
    }
    await delay(200);
  }
  throw new Error(
    `The packaged Electron binary did not open its DevTools endpoint:\n${processHandle.output}`,
  );
};

const packagedAppPath = async (buildPath: string) => {
  const candidates = [
    join(buildPath, "resources", "app", "src", "app"),
    join(buildPath, "Contents", "Resources", "app", "src", "app"),
  ];
  for (const candidate of candidates) {
    try {
      await stat(join(candidate, "index.html"));
      return candidate;
    } catch {
      // Try the next Electron packaging layout.
    }
  }
  const entries = await import("node:fs/promises").then(({ readdir }) =>
    readdir(buildPath, { withFileTypes: true }),
  );
  for (const entry of entries.filter((item) => item.isDirectory() && item.name.endsWith(".app"))) {
    const candidate = join(buildPath, entry.name, "Contents", "Resources", "app", "src", "app");
    try {
      await stat(join(candidate, "index.html"));
      return candidate;
    } catch {
      // Continue through nested app bundles.
    }
  }
  throw new Error("Electron output did not contain the packaged Construct app.");
};

describe("Construct UI Ship to running Electron binary", () => {
  test(
    "creates and ships a Construct workflow in the UI, then opens its Electron game",
    async () => {
      const projectPath = resolve(process.cwd(), "tests/e2e/fixtures/construct/test.c3p");
      const userDataPath = await mkdtemp(join(tmpdir(), "pipelab-construct-ui-binary-"));
      const constructProfilePath = join(userDataPath, "mock-construct-profile");
      const resultPath = join(userDataPath, "ui-ship-result.json");
      let uiPort: number;
      let debugPort: number;
      let uiBuild: StartedProcess | undefined;
      let uiServer: StartedProcess | undefined;
      let browserJourney: StartedProcess | undefined;
      let electronProcess: StartedProcess | undefined;
      let bridgeResultWritten = false;
      let playwrightBrowser: import("playwright").Browser | undefined;

      try {
        await mkdir(join(userDataPath, "config"), { recursive: true });
        await mkdir(constructProfilePath, { recursive: true });
        await writeFile(join(constructProfilePath, "Preferences"), "{}");
        const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
        uiBuild = startProcess(pnpmCommand, ["--filter", "@pipelab/ui", "build"], {
          ...process.env,
          NODE_ENV: "development",
        });
        const buildExit = await uiBuild.exited;
        if (buildExit.code !== 0)
          throw new Error(
            `UI build failed before the browser journey (code ${buildExit.code}):\n${uiBuild.output}`,
          );
        uiPort = await getAvailablePort();
        const baseUrl = `http://127.0.0.1:${uiPort}`;
        const env = {
          ...process.env,
          NODE_ENV: "development",
          UI_BASE_URL: baseUrl,
          CHROMIUM_PATH: process.env.CHROMIUM_PATH || chromium.executablePath(),
          CONSTRUCT_BINARY_E2E: "1",
          CONSTRUCT_BINARY_PROJECT_PATH: projectPath,
          CONSTRUCT_BINARY_PROFILE_PATH: constructProfilePath,
          PIPELAB_CI_USER_DATA: userDataPath,
        };
        uiServer = startProcess(
          pnpmCommand,
          [
            "--filter",
            "@pipelab/ui",
            "preview",
            "--host",
            "127.0.0.1",
            "--port",
            String(uiPort),
            "--strictPort",
          ],
          env,
        );
        await waitForHttp(baseUrl, uiServer);
        await delay(1500);

        browserJourney = startProcess(process.execPath, [browserJourneyPath], env);
        const shipRequest = await waitForJsonFile(
          join(userDataPath, "ui-ship-request.json"),
          browserJourney,
        );
        expect(shipRequest.workflowName).toBe(`workflows/${shipRequest.workflowId}`);
        const targetId =
          process.platform === "win32"
            ? "windows-x64"
            : process.platform === "darwin"
              ? "macos-arm64"
              : "linux-x64";
        const savedWorkflow = JSON.parse(
          await readFile(
            join(userDataPath, "config", "workflows", `${shipRequest.workflowId}.json`),
            "utf8",
          ),
        ) as {
          id: string;
          source: { provider: string; config: { path?: string } };
          builds: Array<{ engine: string; targets: Array<{ id: string }> }>;
          destinations: Array<{ provider: string; config: { outputDir?: string } }>;
        };
        expect(savedWorkflow).toMatchObject({
          id: shipRequest.workflowId,
          source: {
            provider: "@pipelab/plugin-construct/source",
            config: { path: projectPath },
          },
          builds: [
            {
              engine: "@pipelab/plugin-electron/producer",
              targets: [{ id: targetId }],
            },
          ],
          destinations: [
            {
              provider: "@pipelab/core/destination/folder",
              config: { outputDir: join(userDataPath, "artifacts", "local-delivery") },
            },
          ],
        });

        let workflowRun;
        try {
          await runCLI(["workflow", "run", shipRequest.workflowId, "--user-data", userDataPath], {
            env: {
              PIPELAB_DISABLE_HISTORY: "false",
              PIPELAB_TEST_MODE: "true",
              PIPELAB_TEST_CONSTRUCT_EXPORT_FIXTURE: constructExportFixturePath,
            },
          });
          const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath }));
          const history = await storage.getByProject(shipRequest.projectId);
          workflowRun = history.find((entry) => entry.workflowId === shipRequest.workflowId);
          expect(workflowRun?.status).toBe("completed");
          expect(workflowRun?.deliveries).toHaveLength(1);
          expect(workflowRun?.deliveries?.[0]).toMatchObject({
            destinationId: "@pipelab/core/destination/folder",
            status: "completed",
          });
        } catch (error) {
          const message =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          await writeFile(resultPath, JSON.stringify({ error: message }));
          bridgeResultWritten = true;
          throw new Error(`The real CLI workflow run failed after Dashboard Ship: ${message}`);
        }

        const electronBuild = workflowRun?.artifacts.find(
          (artifact) => "descriptor" in artifact && artifact.descriptor.technology === "electron",
        );
        if (!workflowRun || !electronBuild)
          throw new Error(
            "The completed UI-triggered workflow did not produce an Electron artifact.",
          );

        const appPath = await packagedAppPath(electronBuild.path);
        const indexHtml = await readFile(join(appPath, "index.html"), "utf8");
        const packagedIndexSha256 = createHash("sha256").update(indexHtml).digest("hex");
        const fixtureIndexHtml = await readFile(
          join(constructExportFixturePath, "index.html"),
          "utf8",
        );
        expect(packagedIndexSha256).toBe(
          createHash("sha256").update(fixtureIndexHtml).digest("hex"),
        );
        console.info(`Verified packaged Construct index.html SHA-256: ${packagedIndexSha256}`);
        expect(indexHtml).toContain("<title>Guess the Number JavaScript</title>");
        expect(indexHtml).toMatch(
          /<meta\s+name="generator"\s+content="Scirra Construct"\s*\/?\s*>/,
        );
        const projectScript = await readFile(
          join(appPath, "scripts", "project", "main.js"),
          "utf8",
        );
        expect(projectScript).toContain("Instances of TextInput and ResultText");

        const binaryPath =
          process.platform === "darwin"
            ? join(electronBuild.path, "Pipelab.app", "Contents", "MacOS", "Pipelab")
            : join(electronBuild.path, process.platform === "win32" ? "Pipelab.exe" : "Pipelab");
        await stat(binaryPath);
        debugPort = await getAvailablePort();
        const launchArgs = [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          `--remote-debugging-port=${debugPort}`,
          `--user-data-dir=${join(userDataPath, "electron-profile")}`,
        ];
        electronProcess = startProcess(
          process.platform === "linux" ? "xvfb-run" : binaryPath,
          process.platform === "linux" ? ["-a", binaryPath, ...launchArgs] : launchArgs,
          env,
        );
        const devToolsTargets = await waitForDevTools(
          `http://127.0.0.1:${debugPort}/json`,
          60_000,
          electronProcess,
        );
        expect(devToolsTargets.some((target) => target.type === "page")).toBe(true);
        playwrightBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
        const gamePage = playwrightBrowser
          .contexts()
          .flatMap((context) => context.pages())
          .find((page) => page.url().startsWith("http://127.0.0.1:"));
        if (!gamePage) throw new Error("The running Electron binary did not expose a game page.");
        await gamePage.waitForFunction(
          () =>
            document.title === "Guess the Number JavaScript" &&
            Boolean(document.querySelector("canvas")),
          undefined,
          { timeout: 60_000 },
        );
        const canvas = await gamePage
          .locator("canvas")
          .first()
          .evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const pixel = (element as HTMLCanvasElement)
              .getContext("2d")
              ?.getImageData(0, 0, 1, 1).data;
            return {
              width: bounds.width,
              height: bounds.height,
              pixel: pixel ? Array.from(pixel) : [],
            };
          });
        expect(canvas.width).toBeGreaterThan(0);
        expect(canvas.height).toBeGreaterThan(0);
        expect(canvas.pixel).toEqual([0, 0, 0, 255]);
        expect(electronProcess.child.exitCode).toBeNull();

        const history = await new BuildHistoryStorage(
          new PipelabContext({ userDataPath }),
        ).getByProject(shipRequest.projectId);
        await writeFile(resultPath, JSON.stringify({ run: workflowRun, historyEntries: history }));
        bridgeResultWritten = true;
        const browserExit = await browserJourney.exited;
        expect(
          browserExit.code,
          `browser journey failed (${browserExit.code}):\n${browserJourney.output}`,
        ).toBe(0);
      } catch (error) {
        if (!bridgeResultWritten) {
          await writeFile(
            resultPath,
            JSON.stringify({ error: "The UI-to-binary acceptance failed." }),
          );
        }
        throw error;
      } finally {
        await playwrightBrowser?.close().catch(() => undefined);
        await stopProcess(electronProcess);
        await stopProcess(browserJourney);
        await stopProcess(uiServer);
        await stopProcess(uiBuild);
        await rm(userDataPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    },
    30 * 60 * 1000,
  );
});
