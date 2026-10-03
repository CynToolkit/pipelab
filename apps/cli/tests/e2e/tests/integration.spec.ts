import { expect, test, describe, afterEach } from "vitest";
import { writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runCLI } from "@pipelab/test-utils";

describe("End-to-End: Multi-Plugin Integration Test", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "executes a release source through the CLI workflow host",
    async () => {
      sandbox = await createSandbox("release-e2e");
      const { paths } = sandbox;
      const sourcePath = join(paths.input, "release-source");
      const destinationPath = join(paths.output, "release-destination");
      const configPath = join(paths.userData, "config");

      await mkdir(sourcePath, { recursive: true });
      await mkdir(join(configPath, "workflows"), { recursive: true });
      await writeFile(join(sourcePath, "index.html"), "<h1>CLI release</h1>");
      await writeFile(
        join(configPath, "projects.json"),
        JSON.stringify({
          version: "3.0.0",
          projects: [{ id: "main", name: "Main", description: "CLI test" }],
          pipelines: [],
          workflows: [
            {
              id: "release-e2e",
              project: "main",
              lastModified: new Date().toISOString(),
              type: "internal-workflow",
              configName: "workflows/release-e2e",
            },
          ],
        }),
      );
      await writeFile(
        join(configPath, "workflows", "release-e2e.json"),
        JSON.stringify({
          version: "3.0.0",
          id: "release-e2e",
          project: "main",
          name: "CLI release",
          source: {
            provider: "@pipelab/core/source/folder",
            config: { path: sourcePath },
          },
          builds: [],
          destinations: [
            {
              id: "copy-output",
              provider: "@pipelab/core/destination/folder",
              enabled: true,
              config: { outputDir: destinationPath },
              slots: [{ id: "source", enabled: true, input: { source: true }, config: {} }],
            },
          ],
        }),
      );

      const resultPath = join(sandbox.path, "release-result.json");
      await runCLI([
        "workflow",
        "run",
        "release-e2e",
        "--user-data",
        paths.userData,
        "--output",
        resultPath,
      ]);

      await expect(access(join(destinationPath, "index.html"))).resolves.not.toThrow();
      await expect(access(resultPath)).resolves.not.toThrow();
    },
    30 * 60 * 1000,
  );
});
