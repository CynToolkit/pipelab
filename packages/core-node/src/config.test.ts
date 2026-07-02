import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  setupConfigFile,
  setupProjectsConfigFile,
  deletePipelineConfigFileByName,
  deletePipelineConfigFileByPath,
} from "./config";
import { FileRepo } from "@pipelab/shared";
import { PipelabContext } from "./context";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { vol } from "memfs";

// Mock the node:fs and node:fs/promises modules to use memfs
vi.mock("node:fs", async () => {
  const memfs = await import("memfs");
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return {
    ...memfs.fs.promises,
    default: memfs.fs.promises,
  };
});

describe("setupConfigFile & Backup Creation", () => {
  let tempDir: string;
  let context: PipelabContext;

  beforeEach(() => {
    vol.reset();
    tempDir = "/tmp/pipelab-test-config";
    context = new PipelabContext({ userDataPath: tempDir });
  });

  test("should migrate config and create backup files on disk", async () => {
    // 1. Setup V1 configuration file in the context's config path
    const configDir = context.getConfigPath();
    await fs.mkdir(configDir, { recursive: true });

    const projectsFilePath = context.getProjectsPath();

    const v1Config = {
      version: "1.0.0",
      data: {
        "pipeline-1": {
          project: "main",
          type: "internal",
          configName: "pipeline-1",
          lastModified: "2026-06-04",
        },
      },
    };

    await fs.writeFile(projectsFilePath, JSON.stringify(v1Config));

    // 2. Initialize setupConfigFile
    const configInstance = await setupProjectsConfigFile(context);

    // Verify file exists
    expect(existsSync(projectsFilePath)).toBe(true);

    // 3. Retrieve config (this triggers the migration process and onStep callback)
    const migratedConfig = await configInstance.getConfig();

    // 4. Assert the main config is updated on disk to version 3.0.0
    expect(migratedConfig.version).toBe("3.0.0");

    const updatedContent = JSON.parse(await fs.readFile(projectsFilePath, "utf8"));
    expect(updatedContent.version).toBe("3.0.0");

    // 5. Assert that the intermediate backup file was created on disk
    const backupFilePath = path.join(configDir, "projects.v2.0.0.json");
    expect(existsSync(backupFilePath)).toBe(true);

    const backupContent = JSON.parse(await fs.readFile(backupFilePath, "utf8"));
    expect(backupContent.version).toBe("2.0.0");
    expect(backupContent.projects).toHaveLength(1);
    expect(backupContent.pipelines).toHaveLength(1);
  });

  test("should create default config file if missing on setup", async () => {
    const configDir = context.getConfigPath();
    const projectsFilePath = context.getProjectsPath();

    expect(existsSync(projectsFilePath)).toBe(false);

    // Initialize setupConfigFile
    await setupProjectsConfigFile(context);

    // Should create file with default value
    expect(existsSync(projectsFilePath)).toBe(true);
    const content = JSON.parse(await fs.readFile(projectsFilePath, "utf8"));
    expect(content.version).toBe("3.0.0");
    expect(content.projects).toHaveLength(1);
    expect(content.pipelines).toEqual([]);
  });

  test("should fallback to default config and preserve corrupted file if parsing fails", async () => {
    const configDir = context.getConfigPath();
    await fs.mkdir(configDir, { recursive: true });
    const projectsFilePath = context.getProjectsPath();

    await fs.writeFile(projectsFilePath, "{ corrupted json... }");

    const configInstance = await setupProjectsConfigFile(context);
    const config = await configInstance.getConfig();

    expect(config.version).toBe("3.0.0");
    expect(config.projects).toHaveLength(1);
    expect(config.pipelines).toEqual([]);

    // Verify a timestamped corrupted backup file exists
    const files = await fs.readdir(configDir);
    const corruptedFile = files.find(
      (f) => f.startsWith("projects.corrupted.") && f.endsWith(".json"),
    );
    expect(corruptedFile).toBeDefined();
    const corruptedContent = await fs.readFile(path.join(configDir, corruptedFile!), "utf8");
    expect(corruptedContent).toBe("{ corrupted json... }");
  });

  test("should fallback to default config and preserve file if migration throws", async () => {
    const configDir = context.getConfigPath();
    await fs.mkdir(configDir, { recursive: true });
    const projectsFilePath = context.getProjectsPath();

    const customMigrator = {
      defaultValue: { version: "2.0.0", projects: [], pipelines: [] } as any,
      migrate: async () => {
        throw new Error("Migration failed!");
      },
    };

    await fs.writeFile(projectsFilePath, JSON.stringify({ version: "1.0.0", invalidData: true }));

    const configInstance = await setupConfigFile<any>(context.getProjectsPath(), {
      context,
      migrator: customMigrator,
    });
    const config = await configInstance.getConfig();

    expect(config.version).toBe("2.0.0");

    // Verify a timestamped corrupted backup file exists
    const files = await fs.readdir(configDir);
    const corruptedFile = files.find(
      (f) => f.startsWith("projects.corrupted.") && f.endsWith(".json"),
    );
    expect(corruptedFile).toBeDefined();
    const corruptedContent = JSON.parse(
      await fs.readFile(path.join(configDir, corruptedFile!), "utf8"),
    );
    expect(corruptedContent.invalidData).toBe(true);
  });

  test("should save config to disk via setConfig", async () => {
    const configInstance = await setupProjectsConfigFile(context);
    const initialConfig = await configInstance.getConfig();

    const newConfig: FileRepo = {
      ...initialConfig,
      pipelines: [
        {
          id: "pipeline-new",
          project: "main",
          type: "internal",
          configName: "pipeline-new",
          lastModified: "2026-06-05",
        },
      ],
    };

    const success = await configInstance.setConfig(newConfig);
    expect(success).toBe(true);

    const savedContent = JSON.parse(await fs.readFile(context.getProjectsPath(), "utf8"));
    expect(savedContent.pipelines).toHaveLength(1);
    expect(savedContent.pipelines[0].id).toBe("pipeline-new");
  });
});

describe("deletePipelineConfigFile", () => {
  let tempDir: string;
  let context: PipelabContext;

  beforeEach(() => {
    vol.reset();
    tempDir = "/tmp/pipelab-test-config";
    context = new PipelabContext({ userDataPath: tempDir });
  });

  test("should delete pipeline config file using relative name", async () => {
    const configDir = context.getConfigPath();
    await fs.mkdir(configDir, { recursive: true });

    const pipelineFilePath = path.join(configDir, "my-pipeline.json");
    await fs.writeFile(pipelineFilePath, JSON.stringify({ name: "My Pipeline" }));
    expect(existsSync(pipelineFilePath)).toBe(true);

    await deletePipelineConfigFileByName("my-pipeline", context);
    expect(existsSync(pipelineFilePath)).toBe(false);
  });

  test("should delete pipeline config file using absolute path", async () => {
    const configDir = context.getConfigPath();
    await fs.mkdir(configDir, { recursive: true });

    const pipelineFilePath = path.join(configDir, "another-pipeline.json");
    await fs.writeFile(pipelineFilePath, JSON.stringify({ name: "Another Pipeline" }));
    expect(existsSync(pipelineFilePath)).toBe(true);

    await deletePipelineConfigFileByPath(pipelineFilePath, context);
    expect(existsSync(pipelineFilePath)).toBe(false);
  });

  test("should not throw error when attempting to delete non-existent pipeline file", async () => {
    const nonExistentPath = context.getConfigPath("does-not-exist.json");
    expect(existsSync(nonExistentPath)).toBe(false);

    await expect(deletePipelineConfigFileByName("does-not-exist", context)).resolves.not.toThrow();
  });
});
