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
const platformMetadata = new Set([".ds_store", "desktop.ini", "thumbs.db", "ehthumbs.db"]);

async function isPlatformMetadataFile(path: string, entry: string): Promise<boolean> {
  if (!platformMetadata.has(entry.toLowerCase())) return false;
  return (await lstat(join(path, entry))).isFile();
}

async function directoryChildDigests(path: string): Promise<Record<string, string>> {
  const entries = (await readdir(path)).sort();
  const includedEntries = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      include: !(await isPlatformMetadataFile(path, entry)),
    })),
  );
  return Object.fromEntries(
    await Promise.all(
      includedEntries
        .filter(({ include }) => include)
        .map(
          async ({ entry }): Promise<[string, string]> => [
            entry,
            await artifactDigest(join(path, entry)),
          ],
        ),
    ),
  );
}

async function artifactDigest(path: string, ancestors = new Set<string>()): Promise<string> {
  const metadata = await lstat(path);
  const hash = createHash("sha256");
  if (metadata.isSymbolicLink()) {
    const target = await readlink(path);
    let resolvedPath: string;
    try {
      resolvedPath = await realpath(path);
    } catch (error) {
      if (error instanceof Error) {
        error.message = `Artifact symlink "${path}" points to unavailable target "${target}": ${error.message}`;
      }
      throw error;
    }
    hash.update("symlink\0");
    hash.update(target);
    hash.update(await artifactDigest(resolvedPath, ancestors));
  } else if (metadata.isFile()) {
    hash.update(await readFile(path));
  } else if (metadata.isDirectory()) {
    const resolvedPath = await realpath(path);
    if (ancestors.has(resolvedPath)) {
      throw new Error(`Artifact symlink cycle detected at ${path}`);
    }
    const childAncestors = new Set(ancestors).add(resolvedPath);
    const entries = (await readdir(path)).sort();
    const includedEntries = await Promise.all(
      entries.map(async (entry) => ({
        entry,
        include: !(await isPlatformMetadataFile(path, entry)),
      })),
    );
    for (const { entry } of includedEntries.filter(({ include }) => include)) {
      hash.update(entry);
      hash.update(await artifactDigest(join(path, entry), childAncestors));
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
      const outsideTargetDirectory = await mkdtemp(join(tmpdir(), "pipelab-artifact-target-"));
      try {
        const target = join(fixture, "target");
        const outsideTarget = join(outsideTargetDirectory, "payload");
        const link = join(fixture, "link");
        const missingLink = join(fixture, "missing-link");
        await writeFile(target, "packaged artifact");
        await writeFile(outsideTarget, "metadata-named symlink payload");
        await symlink("target", link);
        await symlink("missing", missingLink);

        const digest = await artifactDigest(link);
        expect(digest).toMatch(/^[a-f0-9]{64}$/);
        expect(await artifactDigest(link)).toBe(digest);
        await writeFile(target, "updated artifact");
        expect(await artifactDigest(link)).not.toBe(digest);
        await expect(artifactDigest(missingLink)).rejects.toMatchObject({
          code: "ENOENT",
          message: expect.stringContaining('points to unavailable target "missing"'),
        });
        await rm(missingLink);
        const metadataLink = join(fixture, "desktop.ini");
        await symlink(outsideTarget, metadataLink);
        const fixtureDigest = await artifactDigest(fixture);
        await writeFile(outsideTarget, "changed metadata-named symlink payload");
        expect(await artifactDigest(fixture)).not.toBe(fixtureDigest);
        await symlink(".", join(fixture, "cycle"));
        await expect(artifactDigest(fixture)).rejects.toThrow("Artifact symlink cycle detected");
      } finally {
        await rm(fixture, { recursive: true, force: true });
        await rm(outsideTargetDirectory, { recursive: true, force: true });
      }
    },
  );

  test("ignores platform display metadata while hashing artifact directories", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pipelab-artifact-metadata-"));
    try {
      const artifact = join(fixture, "release.zip");
      const metadata = join(fixture, ".DS_Store");
      await writeFile(artifact, "real release artifact");
      await writeFile(metadata, "initial Finder metadata");
      const digest = await artifactDigest(fixture);

      await writeFile(metadata, "updated Finder metadata");
      expect(await artifactDigest(fixture)).toBe(digest);

      const metadataDirectory = join(fixture, "desktop.ini");
      const nestedArtifact = join(metadataDirectory, "payload.bin");
      await mkdir(metadataDirectory);
      await writeFile(nestedArtifact, "nested artifact");
      const digestWithMetadataNamedDirectory = await artifactDigest(fixture);
      await writeFile(nestedArtifact, "changed nested artifact");
      expect(await artifactDigest(fixture)).not.toBe(digestWithMetadataNamedDirectory);

      await writeFile(artifact, "modified release artifact");
      expect(await artifactDigest(fixture)).not.toBe(digest);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

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
      console.log(
        `CI Construct Ship recorded ${currentRun.id}: ${Date.now() - startedAt}ms, ${currentRun.artifacts.length} artifacts`,
      );
      const artifactManifest = await Promise.all(
        currentRun.artifacts.map(async (artifact) => {
          await access(artifact.path);
          const artifactStat = await lstat(artifact.path);
          return {
            artifact: artifact.artifact,
            path: artifact.path,
            digest: await artifactDigest(artifact.path),
            ...(artifactStat.isDirectory()
              ? { children: await directoryChildDigests(artifact.path) }
              : {}),
          };
        }),
      );
      console.log(
        `CI Construct artifact manifest for ${currentRun.id}: ${JSON.stringify(artifactManifest)}`,
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
          const digest = await artifactDigest(artifact.path);
          const liveChildren = artifact.children
            ? await directoryChildDigests(artifact.path)
            : undefined;
          const changedChildren =
            artifact.children && liveChildren
              ? Object.keys({ ...liveChildren, ...artifact.children }).filter(
                  (name) => liveChildren[name] !== artifact.children?.[name],
                )
              : [];
          expect(
            digest,
            `Artifact from run ${baseline.id} changed after the next Ship: ${artifact.path}; changed children: ${changedChildren.join(", ") || "unknown"}`,
          ).toBe(artifact.digest);
        }
      }
    },
    30 * 60 * 1000,
  );
});
