import { expect, test, describe, afterEach } from "vitest";
import { uploadToPokiRunner } from "./export.js";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSandbox, runAction } from "@pipelab/test-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("End-to-End: Poki Upload Action", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test("should upload to poki using mocked CLI", async () => {
    // 1. Setup Sandbox
    sandbox = await createSandbox("poki-e2e");
    const { paths } = sandbox;

    // Seed dummy input assets
    await writeFile(join(paths.input, "index.html"), "<html><body>Test</body></html>");

    // 2. Pre-seed a mock Poki CLI to avoid downloads and network issues
    // Path matches standard ensureNPMPackage structure
    const relativePokiBin = join("thirdparty", "@poki/cli", "0.1.19", "package", "bin", "index.js");
    await sandbox.mockBinary(
      relativePokiBin,
      "console.log('Mock Poki CLI execution'); process.exit(0);"
    );

    // 3. Run Pipeline
    try {
      await runAction(uploadToPokiRunner, {
        inputs: {
          "input-folder": paths.input,
          project: "poki-game-123",
          name: "release-v1",
          notes: "E2E test notes",
        },
        sandboxPath: sandbox.path,
      });
    } catch (e: any) {
      console.error("Execution failed:", e.message);
      throw e;
    }

    // 4. Verification
    const pokiJsonPath = join(sandbox.path, "poki.json");
    console.log("pokiJsonPath test", pokiJsonPath);
    await expect(access(pokiJsonPath)).resolves.not.toThrow();

    const pokiJsonContent = JSON.parse(await readFile(pokiJsonPath, "utf-8"));
    expect(pokiJsonContent.game_id).toBe("poki-game-123");
  }, 20000);
});
