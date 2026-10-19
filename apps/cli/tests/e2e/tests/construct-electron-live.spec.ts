import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { BuildHistoryStorage, PipelabContext } from "@pipelab/core-node";
import { RELEASE_CONFIG_VERSION } from "@pipelab/shared";
import { runCLI } from "@pipelab/test-utils";

const profilePath = process.env.CONSTRUCT_CI_PROFILE_PATH;
const runNumber = Number(process.env.CONSTRUCT_CI_RUN_NUMBER || 0);
const required = process.env.CONSTRUCT_CI_REQUIRED === "true";

async function artifactDigest(path: string, ancestors = new Set<string>()): Promise<string> {
  const metadata = await lstat(path);
  const hash = createHash("sha256");
  if (metadata.isSymbolicLink()) {
    const target = await readlink(path);
    const resolvedPath = await realpath(path);
    if (ancestors.has(resolvedPath)) {
      throw new Error(`Artifact symlink cycle detected at ${path}`);
    }
    const resolvedAncestors = new Set(ancestors).add(resolvedPath);
    hash.update("symlink\0");
    hash.update(target);
    hash.update(await artifactDigest(resolvedPath, resolvedAncestors));
  } else if (metadata.isFile()) {
    hash.update(await readFile(path));
  } else if (metadata.isDirectory()) {
    for (const entry of (await readdir(path)).sort()) {
      hash.update(entry);
      hash.update(await artifactDigest(join(path, entry)));
    }
  } else {
    throw new Error(`Unsupported artifact type at ${path}`);
  }
  return hash.digest("hex");
}

describe("authenticated local Construct to Electron CI acceptance", () => {
  test.skipIf(process.platform === "win32")(
    "hashes valid symlinks and rejects dangling artifact symlinks",
    async () => {
      const fixture = await mkdtemp(join(tmpdir(), "pipelab-artifact-symlink-"));
      try {
        const target = join(fixture, "target");
        const link = join(fixture, "link");
        const missingLink = join(fixture, "missing-link");
        await writeFile(target, "packaged artifact");
        await symlink("target", link);
        await symlink("missing", missingLink);

        const digest = await artifactDigest(link);
        expect(digest).toMatch(/^[a-f0-9]{64}$/);
        expect(await artifactDigest(link)).toBe(digest);
        await writeFile(target, "updated artifact");
        expect(await artifactDigest(link)).not.toBe(digest);
        await expect(artifactDigest(missingLink)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
    },
  );

  test.skipIf(!profilePath && !required)(
    "reopens a saved workflow, ships locally, and preserves prior artifacts",
    async () => {
      if (!profilePath) throw new Error("Required disposable Construct profile was not populated.");
      expect(runNumber).toBeGreaterThan(0);
      const userDataPath = process.env.PIPELAB_CI_USER_DATA;
      if (!userDataPath) throw new Error("The isolated CI user-data path was not configured.");

      const configPath = join(userDataPath, "config");
      const workflowId = "ci-construct-electron-acceptance";
      const workflowPath = join(configPath, "workflows", `${workflowId}.json`);
      await mkdir(join(configPath, "workflows"), { recursive: true });

      if (runNumber === 1) {
        await writeFile(
          join(configPath, "projects.json"),
          JSON.stringify({
            version: "3.0.0",
            projects: [{ id: "ci-project", name: "CI local release", description: "" }],
            workflows: [
              {
                id: workflowId,
                project: "ci-project",
                lastModified: new Date().toISOString(),
                type: "internal-workflow",
                configName: `workflows/${workflowId}`,
              },
            ],
          }),
        );
        await writeFile(
          join(configPath, "connections.json"),
          JSON.stringify({ version: "1.0.0", connections: [] }),
        );

        const targetId =
          process.platform === "win32"
            ? "windows-x64"
            : process.platform === "darwin"
              ? "macos-arm64"
              : "linux-x64";
        const projectPath = resolve(process.cwd(), "tests/e2e/fixtures/construct/test.c3p");
        await access(projectPath);
        await writeFile(
          workflowPath,
          JSON.stringify({
            version: RELEASE_CONFIG_VERSION,
            id: workflowId,
            project: "ci-project",
            name: "CI local Construct to Electron acceptance",
            source: {
              provider: "@pipelab/plugin-construct/source",
              config: { path: projectPath, profilePath },
            },
            builds: [
              {
                id: "electron-profile",
                type: "desktop",
                engine: "@pipelab/plugin-electron/producer",
                enabled: true,
                config: {},
                targets: [{ id: targetId, enabled: true, config: {} }],
              },
            ],
            destinations: [],
          }),
        );
      } else {
        await access(workflowPath);
      }

      const startedAt = Date.now();
      await runCLI(["workflow", "run", workflowId, "--user-data", userDataPath]);

      const storage = new BuildHistoryStorage(new PipelabContext({ userDataPath }));
      const runs = await storage.getByProject("ci-project");
      expect(runs).toHaveLength(runNumber);
      expect(runs.map((run) => run.status)).toEqual(Array(runNumber).fill("completed"));

      const currentRun = runs[0];
      if (!currentRun) throw new Error("Successful run was not written to history.");
      expect(currentRun.artifacts.length).toBeGreaterThan(0);
      const artifactManifest = await Promise.all(
        currentRun.artifacts.map(async (artifact) => {
          await access(artifact.path);
          return {
            artifact: artifact.artifact,
            path: artifact.path,
            digest: await artifactDigest(artifact.path),
          };
        }),
      );

      for (const run of runs) {
        expect(run.artifacts.length).toBeGreaterThan(0);
        for (const artifact of run.artifacts) await access(artifact.path);
      }

      const historyFile = join(configPath, "pipelines", "ci-project.history.json");
      await readFile(historyFile, "utf8");
      const baselinePath = join(userDataPath, "construct-electron-baseline.json");
      if (runNumber === 1) {
        await writeFile(baselinePath, JSON.stringify({ id: currentRun.id, artifactManifest }));
      } else {
        const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
          id: string;
          artifactManifest: typeof artifactManifest;
        };
        expect(currentRun.id).not.toBe(baseline.id);
        const earlierRun = runs.find((run) => run.id === baseline.id);
        expect(earlierRun).toBeDefined();
        expect(earlierRun?.artifacts.map((artifact) => artifact.path).sort()).toEqual(
          baseline.artifactManifest.map((artifact) => artifact.path).sort(),
        );
        for (const artifact of baseline.artifactManifest) {
          expect(await artifactDigest(artifact.path)).toBe(artifact.digest);
        }
      }
      console.log(
        `CI Construct Ship ${currentRun.id}: ${Date.now() - startedAt}ms, ${currentRun.artifacts.length} artifacts`,
      );
    },
    30 * 60 * 1000,
  );
});
