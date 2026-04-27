import { expect, test, describe, afterEach } from "vitest";
import { writeFile, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSandbox, runCLI } from "@pipelab/test-utils";

describe("End-to-End: Build History", () => {
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.remove();
    }
  });

  test(
    "should generate and save a build history when PIPELAB_DISABLE_HISTORY is false",
    async () => {
      sandbox = await createSandbox("history-e2e");

      const pipelineId = "test-history-pipeline";
      const pipeline = {
        graph: [], // Empty graph will execute successfully
        projectPath: sandbox.path,
        projectName: "History E2E Test",
        pipelineId,
      };

      const pipelineFile = join(sandbox.path, "pipeline.json");
      await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));

      // Run the CLI using the helper but explicitly set disable history to false
      await runCLI(["run", pipelineFile, "--user-data", sandbox.paths.userData], {
        env: {
          PIPELAB_DISABLE_HISTORY: "false",
        },
      });

      // The build history should be generated in the user-data folder
      // Based on BuildHistoryStorage.getPipelinePath, the filename should be pipeline-<sanitizedId>.json
      const historyFile = join(sandbox.paths.userData, "build-history", `pipeline-${pipelineId}.json`);
      
      // Verification: file must exist
      await expect(access(historyFile)).resolves.not.toThrow();

      const historyContent = await readFile(historyFile, "utf-8");
      const history = JSON.parse(historyContent);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      
      const lastEntry = history[history.length - 1];
      expect(lastEntry.pipelineId).toBe(pipelineId);
      expect(lastEntry.status).toBe("completed");
    },
    5 * 60 * 1000,
  );
});
