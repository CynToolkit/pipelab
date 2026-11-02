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

const repoRoot = resolve(process.cwd(), "../..");
const constructExportFixturePath = resolve(process.cwd(), "tests/e2e/fixtures/construct-export");
const playwrightRequire = createRequire(join(repoRoot, "apps/website/package.json"));
const { chromium } = playwrightRequire("playwright") as typeof import("playwright");

type StartedProcess = {
  child: ChildProcessWithoutNullStreams;
  output: string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

const startProcess = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  keepStdinOpen = false,
): StartedProcess => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    stdio: [keepStdinOpen ? "pipe" : "ignore", "pipe", "pipe"],
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

const stopProcess = async (handle: StartedProcess | undefined) => {
  if (!handle || handle.child.exitCode !== null) return;
  const { child } = handle;
  if (child.pid) {
    try {
      process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  if (await Promise.race([handle.exited.then(() => true), delay(5000).then(() => false)])) return;
  if (child.pid) {
    try {
      process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
  await Promise.race([handle.exited, delay(5000)]);
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

const waitForHttp = async (url: string, handle: StartedProcess) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null)
      throw new Error(`UI server exited (${handle.child.exitCode}):\n${handle.output}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite has not started yet.
    }
    await delay(200);
  }
  throw new Error(`UI server did not start:\n${handle.output}`);
};

const waitForDevTools = async (url: string, handle: StartedProcess) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null)
      throw new Error(
        `Desktop exited before DevTools was ready (code ${handle.child.exitCode}, signal ${handle.child.signalCode}):\n${handle.output}`,
      );
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Electron is starting.
    }
    await delay(200);
  }
  throw new Error(`Desktop DevTools did not become ready:\n${handle.output}`);
};

const waitForOutput = async (handle: StartedProcess, text: string) => {
  const deadline = Date.now() + 30_000;
  while (!handle.output.includes(text) && Date.now() < deadline) await delay(100);
  if (!handle.output.includes(text))
    throw new Error(`Desktop did not report ${text}:\n${handle.output}`);
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
      // Check the next Electron packaging layout.
    }
  }
  throw new Error("Electron output did not contain the packaged Construct app.");
};

describe("Construct Desktop Ship to running Electron binary", () => {
  test(
    "creates and ships a Construct workflow through Desktop and its real CLI sidecar",
    async () => {
      const userDataPath = await mkdtemp(join(tmpdir(), "pipelab-construct-desktop-e2e-"));
      const sourcePath = join(userDataPath, "source", "test.c3p");
      const outputPath = join(userDataPath, "artifacts", "local-delivery");
      const testProfileRoot = join(userDataPath, "chromium");
      const profilePath = join(testProfileRoot, "YourProfile");
      const projectFixture = resolve(process.cwd(), "tests/e2e/fixtures/construct/test.c3p");
      const uiPort = await getAvailablePort();
      const debugPort = await getAvailablePort();
      const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      let uiBuild: StartedProcess | undefined;
      let uiServer: StartedProcess | undefined;
      let desktop: StartedProcess | undefined;
      let game: StartedProcess | undefined;
      let browser: import("playwright").Browser | undefined;
      let gameBrowser: import("playwright").Browser | undefined;
      let desktopPage: import("playwright").Page | undefined;

      try {
        await mkdir(join(userDataPath, "config"), { recursive: true });
        await mkdir(join(userDataPath, "source"), { recursive: true });
        await mkdir(outputPath, { recursive: true });
        await mkdir(profilePath, { recursive: true });
        await writeFile(sourcePath, await readFile(projectFixture));
        await writeFile(join(profilePath, "Preferences"), "{}");
        await writeFile(
          join(userDataPath, "config", "settings.json"),
          JSON.stringify({
            locale: "en-US",
            theme: "light",
            version: "8.0.0",
            autosave: true,
            agents: [],
            tours: {
              dashboard: { step: 0, completed: true },
              editor: { step: 0, completed: true },
            },
          }),
        );

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          NODE_ENV: "development",
          PIPELAB_TEST_MODE: "true",
          PIPELAB_TEST_CONSTRUCT_EXPORT_FIXTURE: constructExportFixturePath,
          PIPELAB_TEST_CONSTRUCT_PROFILE_ROOT: testProfileRoot,
          PIPELAB_TEST_DESKTOP: "1",
          PIPELAB_TEST_DESKTOP_USER_DATA_PATH: userDataPath,
          PIPELAB_TEST_DESKTOP_DEBUG_PORT: String(debugPort),
          PIPELAB_TEST_DESKTOP_UI_PORT: String(uiPort),
          PIPELAB_TEST_DESKTOP_SOURCE_PATH: sourcePath,
          PIPELAB_TEST_DESKTOP_OUTPUT_PATH: outputPath,
        };
        uiBuild = startProcess(pnpmCommand, ["--filter", "@pipelab/ui", "build"], env);
        const buildExit = await uiBuild.exited;
        if (buildExit.code !== 0) {
          throw new Error(`UI build failed (${buildExit.code}):\n${uiBuild.output}`);
        }
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
        await waitForHttp(`http://127.0.0.1:${uiPort}`, uiServer);

        const desktopArgs = ["--filter", "@pipelab/app", "run", "start", "--", "--headless"];
        if (process.platform === "linux") desktopArgs.push("--no-sandbox");
        desktop = startProcess(
          process.platform === "linux" ? "xvfb-run" : pnpmCommand,
          process.platform === "linux" ? ["-a", pnpmCommand, ...desktopArgs] : desktopArgs,
          env,
          true,
        );
        await waitForDevTools(`http://127.0.0.1:${debugPort}/json`, desktop);
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
        const desktopContext = browser.contexts()[0];
        if (!desktopContext) throw new Error("Desktop did not expose its default browser context.");
        await desktopContext.route(`http://127.0.0.1:${uiPort}/assets/**`, async (route) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await route.fulfill({ response: await route.fetch() });
              return;
            } catch (error) {
              if (
                attempt > 0 ||
                !(error instanceof Error) ||
                !error.message.includes("ERR_NETWORK_CHANGED")
              ) {
                throw error;
              }
            }
          }
        });
        const rendererDeadline = Date.now() + 60_000;
        let page = browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => new URL(candidate.url()).port === String(uiPort));
        while (!page && Date.now() < rendererDeadline) {
          await delay(200);
          page = browser
            .contexts()
            .flatMap((context) => context.pages())
            .find((candidate) => new URL(candidate.url()).port === String(uiPort));
        }
        if (!page) throw new Error("Desktop did not expose its renderer page.");
        desktopPage = page;
        const rendererErrors: string[] = [];
        page.on("pageerror", (error) => rendererErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") rendererErrors.push(message.text());
        });
        await page.waitForFunction(() => /[?&]cliPort=\d+/.test(location.href), undefined, {
          timeout: 60_000,
        });
        const cliPort = new URL(page.url()).searchParams.get("cliPort");
        assert.ok(cliPort, "Desktop loaded the UI with the managed CLI port");
        try {
          await page
            .getByRole("heading", { name: "Project overview" })
            .waitFor({ timeout: 60_000 });
        } catch (error) {
          throw new Error(
            `Desktop UI did not reach Dashboard (${page.url()}, ${await page.title()}): ${await page
              .locator("body")
              .innerText()
              .catch(
                () => "<no body>",
              )}\nRenderer errors: ${rendererErrors.join("; ")}\n${desktop.output}\n${String(error)}`,
          );
        }
        await waitForOutput(desktop, "WebSocket client connected");
        await page
          .getByRole("button", { name: /New workflow/ })
          .first()
          .click();
        const dialog = page.getByRole("dialog", { name: "New release" });
        await dialog.waitFor();
        await dialog.getByLabel("Name", { exact: true }).fill("Construct Desktop E2E");
        await dialog
          .getByLabel("Description", { exact: true })
          .fill("Desktop managed CLI acceptance");
        await dialog.getByRole("button", { name: "Continue" }).click();
        await dialog.getByRole("button", { name: /^Construct project/ }).click();
        await dialog.getByRole("button", { name: /Choose Project file/i }).click();
        await dialog.getByLabel("Project file", { exact: true }).waitFor();
        await dialog.getByRole("button", { name: "Continue" }).click();
        await dialog.getByRole("heading", { name: "Where do you want to ship?" }).waitFor();
        await dialog.getByRole("button", { name: /^(File system|Folder)/ }).click();
        await dialog.getByRole("button", { name: "Continue" }).click();
        await dialog.getByRole("button", { name: "Create workflow" }).click();
        await page.waitForURL(/\/workflows\/[^/]+\/[^/]+$/);
        await page.getByRole("link", { name: "Builds", exact: true }).click();
        await page.getByRole("heading", { name: "Build profiles" }).waitFor();
        await page.getByRole("button", { name: "Add build" }).first().click();
        const addBuildDialog = page.getByRole("dialog", { name: "Add build" });
        await addBuildDialog.getByText("Choose a build type", { exact: true }).click();
        await page.getByRole("option", { name: "Desktop", exact: true }).click();
        await addBuildDialog.getByText("Choose an engine", { exact: true }).click();
        await page.getByRole("option", { name: "Electron", exact: true }).click();
        const targetId =
          process.platform === "win32"
            ? "windows-x64"
            : process.platform === "darwin"
              ? "macos-arm64"
              : "linux-x64";
        const targetButtons = addBuildDialog.locator(".target-row");
        await targetButtons
          .first()
          .waitFor({ timeout: 15_000 })
          .catch(async (error: unknown) => {
            throw new Error(
              `No target choices were shown after selecting Electron: ${await addBuildDialog.innerText().catch(() => "<closed>")}\n${String(error)}`,
            );
          });
        const targetLabels = await targetButtons.allTextContents();
        const targetIndex = targetLabels.findIndex((label) => label.includes(targetId));
        expect(
          targetIndex,
          `available Electron targets: ${targetLabels.join(" | ")}`,
        ).toBeGreaterThanOrEqual(0);
        await targetButtons.nth(targetIndex).click();
        await addBuildDialog.getByRole("button", { name: "Add build" }).click();
        await page.getByText("Electron", { exact: true }).waitFor();
        await page.getByRole("link", { name: "Configuration", exact: true }).click();
        await page
          .locator(".source-card")
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        const sourceDialog = page.getByRole("dialog", { name: "Edit source" });
        await sourceDialog.getByText("Select browser profile", { exact: true }).click();
        await page.getByRole("option", { name: /Chrome \/ YourProfile|YourProfile/ }).click();
        await sourceDialog.getByRole("button", { name: "Done" }).click();
        const destinationCard = page.locator(".job-card").first();
        await destinationCard
          .locator(".job-header")
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        const destinationDialog = page.getByRole("dialog", { name: "Edit destination" });
        await destinationDialog.getByRole("button", { name: "Choose output folder" }).click();
        await destinationDialog.getByLabel("Output folder", { exact: true }).waitFor();
        await destinationDialog.getByRole("button", { name: "Done" }).click();
        await page
          .getByRole("button", { name: "Ship" })
          .waitFor({ state: "visible", timeout: 60_000 });
        await page.getByRole("link", { name: "Dashboard" }).click();
        const dashboardShip = page.getByRole("button", { name: "Ship Construct Desktop E2E" });
        await dashboardShip.waitFor();
        await dashboardShip.click();
        const confirmation = page.getByRole("dialog", { name: /Release details/ });
        await confirmation.getByRole("button", { name: "Ship release" }).click();
        await page.waitForURL(/\/runs\//, { timeout: 30 * 60 * 1000 });
        expect(desktop.output).toContain("WebSocket client connected");

        const workflowConfigPath = join(userDataPath, "config", "workflows");
        const workflowFiles = await (await import("node:fs/promises")).readdir(workflowConfigPath);
        const workflowFile = workflowFiles.find((name) => name.endsWith(".json"));
        if (!workflowFile)
          throw new Error(
            "Desktop CLI did not persist the workflow through its WebSocket handler.",
          );
        const workflow = JSON.parse(
          await readFile(join(workflowConfigPath, workflowFile), "utf8"),
        ) as {
          id: string;
          project: string;
          source: { provider: string; config: { path: string; profilePath: string } };
          builds: Array<{ engine: string; targets: Array<{ id: string }> }>;
          destinations: Array<{ provider: string; config: { outputDir?: string } }>;
        };
        expect(workflow.source).toMatchObject({
          provider: "@pipelab/plugin-construct/source",
          config: { path: sourcePath, profilePath },
        });
        expect(workflow.builds[0]).toMatchObject({
          engine: "@pipelab/plugin-electron/producer",
          targets: expect.arrayContaining([
            expect.objectContaining({ id: targetId, enabled: true }),
          ]),
        });
        expect(workflow.destinations[0]).toMatchObject({
          provider: "@pipelab/core/destination/folder",
          config: { outputDir: outputPath },
        });

        const historyStorage = new BuildHistoryStorage(new PipelabContext({ userDataPath }));
        let history = await historyStorage.getByProject(workflow.project);
        const deadline = Date.now() + 30 * 60 * 1000;
        while (
          !history.some(
            (entry) => entry.workflowId === workflow.id && entry.status === "completed",
          ) &&
          Date.now() < deadline
        ) {
          await delay(500);
          history = await historyStorage.getByProject(workflow.project);
        }
        const workflowRun = history.find((entry) => entry.workflowId === workflow.id);
        expect(workflowRun?.status).toBe("completed");
        expect(workflowRun?.deliveries).toHaveLength(1);
        expect(workflowRun?.deliveries?.[0]).toMatchObject({
          destinationId: "@pipelab/core/destination/folder",
          status: "completed",
        });
        const electronBuild = workflowRun?.artifacts.find(
          (artifact) => "descriptor" in artifact && artifact.descriptor.technology === "electron",
        );
        if (!electronBuild)
          throw new Error("The UI-triggered workflow did not produce an Electron artifact.");
        const appPath = await packagedAppPath(electronBuild.path);
        const indexHtml = await readFile(join(appPath, "index.html"), "utf8");
        const packagedHash = createHash("sha256").update(indexHtml).digest("hex");
        const fixtureHtml = await readFile(join(constructExportFixturePath, "index.html"), "utf8");
        expect(packagedHash).toBe(createHash("sha256").update(fixtureHtml).digest("hex"));
        expect(indexHtml).toContain("<title>Guess the Number JavaScript</title>");
        expect(indexHtml).toMatch(
          /<meta\s+name="generator"\s+content="Scirra Construct"\s*\/?\s*>/,
        );
        const gamePath =
          process.platform === "darwin"
            ? join(electronBuild.path, "Pipelab.app", "Contents", "MacOS", "Pipelab")
            : join(electronBuild.path, process.platform === "win32" ? "Pipelab.exe" : "Pipelab");
        await stat(gamePath);
        const gameDebugPort = await getAvailablePort();
        const gameArgs = [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          `--remote-debugging-port=${gameDebugPort}`,
          `--user-data-dir=${join(userDataPath, "game-profile")}`,
        ];
        game = startProcess(
          process.platform === "linux" ? "xvfb-run" : gamePath,
          process.platform === "linux" ? ["-a", gamePath, ...gameArgs] : gameArgs,
          env,
        );
        await waitForDevTools(`http://127.0.0.1:${gameDebugPort}/json`, game);
        gameBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${gameDebugPort}`);
        const gamePage = gameBrowser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url().startsWith("http://127.0.0.1:"));
        if (!gamePage) throw new Error("The produced Electron binary did not expose a game page.");
        await gamePage.waitForFunction(
          () => {
            if (document.title !== "Guess the Number JavaScript") return false;
            const pixel = document
              .querySelector("canvas")
              ?.getContext("2d")
              ?.getImageData(0, 0, 1, 1).data;
            return Boolean(
              pixel && pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 255,
            );
          },
          undefined,
          { timeout: 60_000 },
        );
        expect(game.child.exitCode).toBeNull();
      } finally {
        await desktopPage?.evaluate(() => window.close()).catch(() => undefined);
        if (desktop) {
          await Promise.race([desktop.exited, delay(15_000)]);
        }
        await gameBrowser?.close().catch(() => undefined);
        await browser?.close().catch(() => undefined);
        await stopProcess(game);
        await stopProcess(desktop);
        await stopProcess(uiServer);
        await stopProcess(uiBuild);
        await rm(userDataPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    },
    45 * 60 * 1000,
  );
});
