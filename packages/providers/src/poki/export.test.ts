import { expect, test, describe, afterEach, beforeEach, vi } from "vitest";
import { createPokiUploadTask, POKI_CLI_VERSION } from "./export.js";
import { mkdir, writeFile, readFile, access, readdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSandbox, runWorkflowTask } from "@pipelab/test-utils";
import { SandboxFolder } from "@pipelab/constants";
import pokiPlugin from "./index.js";
import { normalizePokiAccountName, pokiAccountConfigRoot } from "./auth.js";
import { fetchPackage, type PipelabContext } from "@pipelab/plugin-core";
import type { PokiTaskServices } from "./export.js";

vi.mock("@pipelab/plugin-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/plugin-core")>();
  return { ...actual, fetchPackage: vi.fn() };
});

test("exposes a Poki account connection that stores a name, never a token", () => {
  const integration = pokiPlugin.integrations?.find((item) => item.name === "Poki Account");
  expect(integration?.fields.map((field) => [field.key, field.type])).toEqual([
    ["account", "text"],
  ]);
});

test("normalizes Poki account names and rejects unsafe ones", () => {
  expect(normalizePokiAccountName(" Studio-1 ")).toBe("studio-1");
  expect(() => normalizePokiAccountName("../evil")).toThrow("Poki account name");
  expect(() => normalizePokiAccountName("")).toThrow("Poki account name");
});

describe("End-to-End: Poki Upload Workflow task", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;
  const tempRoots: string[] = [];
  const makeTempRoot = async (prefix: string) => {
    const root = await mkdtemp(join(tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  };

  // Keep the developer's real Poki CLI login out of these tests.
  beforeEach(async () => {
    const emptyConfigRoot = await makeTempRoot("poki-empty-config-");
    vi.stubEnv("XDG_CONFIG_HOME", emptyConfigRoot);
    vi.stubEnv("LOCALAPPDATA", emptyConfigRoot);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(fetchPackage).mockReset();
    if (sandbox) {
      await sandbox.remove();
    }
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  const servicesFor = (sandboxPath: string): PokiTaskServices => {
    const thirdparty = join(sandboxPath, "user-data", "thirdparty");
    const tempRoot = join(sandboxPath, "user-data", "temp");
    return {
      context: {
        getThirdPartyPath: () => thirdparty,
        createTempFolder: async (prefix = "pipelab-") => {
          await mkdir(tempRoot, { recursive: true });
          return mkdtemp(join(tempRoot, prefix));
        },
      } as unknown as PipelabContext,
      executables: { node: process.execPath },
    };
  };

  test(
    "should upload to poki using mocked CLI",
    async () => {
      // 1. Setup Sandbox
      sandbox = await createSandbox("poki-e2e");
      const { paths } = sandbox;

      // Seed dummy input assets
      await writeFile(join(paths.input, "index.html"), "<html><body>Test</body></html>");
      const authDir = join(sandbox.path, "user-data", SandboxFolder.ThirdParty, "poki");
      await mkdir(authDir, { recursive: true });
      await writeFile(join(authDir, "auth.json"), JSON.stringify({ access_type: "Bearer" }));

      // 2. Pre-seed a mock Poki CLI to avoid downloads and network issues
      // Path matches new flat fetchPackage structure
      const pokiDir = join(sandbox.path, "mock-poki-cli");
      await sandbox.mockBinary(
        join("mock-poki-cli", "bin", "index.js"),
        `
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(
          path.join(process.cwd(), 'mock-env.json'),
          JSON.stringify({
            XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
            LOCALAPPDATA: process.env.LOCALAPPDATA,
            argv: process.argv
          }, null, 2)
        );
        console.log('Version uploaded successfully');
        process.exit(0);
        `,
      );
      vi.mocked(fetchPackage).mockResolvedValue({ packageDir: pokiDir } as Awaited<
        ReturnType<typeof fetchPackage>
      >);

      // 3. Run the upload task
      try {
        const services = servicesFor(sandbox.path);
        const result = await runWorkflowTask(createPokiUploadTask(services), {
          inputs: {
            "input-folder": paths.input,
            project: "poki-game-123",
            name: "release-v1",
            notes: "E2E test notes",
          },
          workspacePath: sandbox.path,
          services,
        });
        expect(result.result.steps.task.status).toBe("completed");
        expect(fetchPackage).toHaveBeenCalledWith("@poki/cli", POKI_CLI_VERSION, {
          context: services.context,
          installDeps: true,
        });
      } catch (e: any) {
        console.error("Execution failed:", e.message);
        throw e;
      }

      // 4. Verification
      const tempPath = join(sandbox.path, "user-data", "temp");
      const files = await readdir(tempPath);
      const uploadFolder = files.find((f) => f.startsWith("poki-upload-"));
      if (!uploadFolder) throw new Error("Temp upload folder not found");
      const tempUploadFolder = join(tempPath, uploadFolder);

      const pokiJsonPath = join(tempUploadFolder, "poki.json");
      console.log("pokiJsonPath test", pokiJsonPath);
      await expect(access(pokiJsonPath)).resolves.not.toThrow();

      const pokiJsonContent = JSON.parse(await readFile(pokiJsonPath, "utf-8"));
      expect(pokiJsonContent.game_id).toBe("poki-game-123");

      // Verify that the Poki CLI process was indeed run with the sandboxed thirdparty environment variables
      const mockEnvPath = join(tempUploadFolder, "mock-env.json");
      await expect(access(mockEnvPath)).resolves.not.toThrow();
      const mockEnv = JSON.parse(await readFile(mockEnvPath, "utf-8"));
      const expectedSandboxConfigDir = join(sandbox.path, "user-data", SandboxFolder.ThirdParty);
      expect(mockEnv.XDG_CONFIG_HOME).toBe(expectedSandboxConfigDir);
      expect(mockEnv.LOCALAPPDATA).toBe(expectedSandboxConfigDir);

      // Verify command arguments
      expect(mockEnv.argv).toContain("upload");
      expect(mockEnv.argv).toContain("release-v1");
      expect(mockEnv.argv).toContain("E2E test notes");

      // Verify that the input files were copied to the dist directory
      const absoluteBuildDir = join(tempUploadFolder, pokiJsonContent.build_dir);
      const htmlPath = join(absoluteBuildDir, "index.html");
      await expect(access(htmlPath)).resolves.not.toThrow();
      const htmlContent = await readFile(htmlPath, "utf-8");
      expect(htmlContent).toBe("<html><body>Test</body></html>");
    },
    30 * 60 * 1000,
  );

  test("uses a standard Poki CLI login in place without copying it", async () => {
    sandbox = await createSandbox("poki-standard-login");
    await writeFile(join(sandbox.paths.input, "index.html"), "<html></html>");
    const userConfigRoot = await makeTempRoot("poki-user-config-");
    vi.stubEnv("XDG_CONFIG_HOME", userConfigRoot);
    vi.stubEnv("LOCALAPPDATA", userConfigRoot);
    const authDirectory = join(userConfigRoot, process.platform === "win32" ? "Poki" : "poki");
    await mkdir(authDirectory, { recursive: true });
    await writeFile(join(authDirectory, "auth.json"), JSON.stringify({ access_type: "Bearer" }));
    const pokiDir = join(sandbox.path, "mock-poki-cli");
    await sandbox.mockBinary(
      join("mock-poki-cli", "bin", "index.js"),
      `require("node:fs").writeFileSync(require("node:path").join(process.cwd(), "mock-env.json"), JSON.stringify({ XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME }));
console.log("Version uploaded successfully");`,
    );
    vi.mocked(fetchPackage).mockResolvedValue({ packageDir: pokiDir } as Awaited<
      ReturnType<typeof fetchPackage>
    >);

    await runWorkflowTask(createPokiUploadTask(servicesFor(sandbox.path)), {
      inputs: {
        "input-folder": sandbox.paths.input,
        project: "poki-game-123",
        name: "release-v1",
        notes: "test notes",
      },
      workspacePath: sandbox.path,
      services: servicesFor(sandbox.path),
    });

    const tempPath = join(sandbox.path, "user-data", "temp");
    const uploadFolder = (await readdir(tempPath)).find((f) => f.startsWith("poki-upload-"))!;
    const seen = JSON.parse(await readFile(join(tempPath, uploadFolder, "mock-env.json"), "utf-8"));
    expect(seen.XDG_CONFIG_HOME).toBe(userConfigRoot);
    await expect(
      access(join(sandbox.path, "user-data", "thirdparty", "poki", "auth.json")),
    ).rejects.toThrow();
  });

  test("runs a named account against its Pipelab-managed login", async () => {
    sandbox = await createSandbox("poki-named-account");
    await writeFile(join(sandbox.paths.input, "index.html"), "<html></html>");
    const thirdparty = join(sandbox.path, "user-data", "thirdparty");
    const accountRoot = pokiAccountConfigRoot(thirdparty, "Studio");
    const authDirectory = join(accountRoot, process.platform === "win32" ? "Poki" : "poki");
    await mkdir(authDirectory, { recursive: true });
    await writeFile(join(authDirectory, "auth.json"), JSON.stringify({ access_type: "Bearer" }));
    const pokiDir = join(sandbox.path, "mock-poki-cli");
    await sandbox.mockBinary(
      join("mock-poki-cli", "bin", "index.js"),
      `require("node:fs").writeFileSync(require("node:path").join(process.cwd(), "mock-env.json"), JSON.stringify({ XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME }));
console.log("Version uploaded successfully");`,
    );
    vi.mocked(fetchPackage).mockResolvedValue({ packageDir: pokiDir } as Awaited<
      ReturnType<typeof fetchPackage>
    >);
    const run = (alias: string) =>
      runWorkflowTask(createPokiUploadTask(servicesFor(sandbox.path)), {
        inputs: {
          "input-folder": sandbox.paths.input,
          accountConnectionId: alias,
          project: "poki-game-123",
          name: "release-v1",
          notes: "test notes",
        },
        connectionValues: { studio: { account: "Studio" }, other: { account: "Other" } },
        workspacePath: sandbox.path,
        services: servicesFor(sandbox.path),
      });

    await run("studio");
    const tempPath = join(sandbox.path, "user-data", "temp");
    const uploadFolder = (await readdir(tempPath)).find((f) => f.startsWith("poki-upload-"))!;
    const seen = JSON.parse(await readFile(join(tempPath, uploadFolder, "mock-env.json"), "utf-8"));
    expect(seen.XDG_CONFIG_HOME).toBe(accountRoot);

    // The account name is a plain-text field, so real runs keep it readable;
    // this harness passes no field metadata and redacts it.
    await expect(run("other")).rejects.toThrow(/pipelab settings integrations poki login /);
  });

  test("fails before invoking the CLI upload when Poki authentication is missing", async () => {
    sandbox = await createSandbox("poki-no-auth");
    await writeFile(join(sandbox.paths.input, "index.html"), "<html></html>");
    const browserAttemptPath = join(sandbox.path, "poki-browser-auth-attempted");
    const pokiDir = join(sandbox.path, "mock-poki-cli");
    await sandbox.mockBinary(
      join("mock-poki-cli", "bin", "index.js"),
      `require("node:fs").writeFileSync(${JSON.stringify(browserAttemptPath)}, "attempted");`,
    );
    vi.mocked(fetchPackage).mockResolvedValue({ packageDir: pokiDir } as Awaited<
      ReturnType<typeof fetchPackage>
    >);

    await expect(
      runWorkflowTask(createPokiUploadTask(servicesFor(sandbox.path)), {
        inputs: {
          "input-folder": sandbox.paths.input,
          project: "poki-game-123",
          name: "release-v1",
          notes: "test notes",
        },
        workspacePath: sandbox.path,
        services: servicesFor(sandbox.path),
      }),
    ).rejects.toThrow("pipelab settings integrations poki login");
    await expect(access(browserAttemptPath)).rejects.toThrow();
  });

  test("reports CLI authentication errors even when it exits successfully", async () => {
    sandbox = await createSandbox("poki-cli-auth-error");
    await writeFile(join(sandbox.paths.input, "index.html"), "<html></html>");
    const authDir = join(sandbox.path, "user-data", SandboxFolder.ThirdParty, "poki");
    await mkdir(authDir, { recursive: true });
    await writeFile(join(authDir, "auth.json"), JSON.stringify({ access_type: "Bearer" }));

    const pokiDir = join(sandbox.path, "mock-poki-cli");
    await sandbox.mockBinary(
      join("mock-poki-cli", "bin", "index.js"),
      `console.error('Error: {"statusCode":401,"data":"Unauthorized"}');\nprocess.exit(0);`,
    );
    vi.mocked(fetchPackage).mockResolvedValue({ packageDir: pokiDir } as Awaited<
      ReturnType<typeof fetchPackage>
    >);

    await expect(
      runWorkflowTask(createPokiUploadTask(servicesFor(sandbox.path)), {
        inputs: {
          "input-folder": sandbox.paths.input,
          project: "poki-game-123",
          name: "release-v1",
          notes: "test notes",
        },
        workspacePath: sandbox.path,
        services: servicesFor(sandbox.path),
      }),
    ).rejects.toThrow("Poki rejected the cached authentication or denied access to this game.");
  });
});
