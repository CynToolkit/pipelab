import type { WorkflowTask } from "@pipelab/workflow-runtime";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import AdmZip from "adm-zip";

/** Provider boundary for Godot packaging. The workflow registry exposes only godot:export. */
export const createGodotExportTask = (): WorkflowTask => async (taskContext) => {
  const project = String(taskContext.inputs.project || "");
  const preset = String(taskContext.inputs.preset || "").trim();
  const outputId = String(taskContext.inputs.outputId || "");
  if (!project) throw new Error("Godot export requires a project folder");
  if (!preset) throw new Error("Choose an available Godot export preset for this build output");
  const executable = String(taskContext.inputs.godotExecutable || "godot");
  const outputDirectory = resolve(taskContext.workspace.root, ".pipelab-godot", String(taskContext.inputs.packagerId || "build"), outputId);
  await rm(outputDirectory, { recursive: true, force: true });
  await taskContext.filesystem.ensureDirectory(outputDirectory);
  const platform = String(taskContext.inputs.platform || "");
  const projectName = String(taskContext.inputs.projectName || "game").replace(/[^a-zA-Z0-9_-]/g, "-");
  const filename = platform === "windows" ? `${projectName}.exe` : platform === "linux" ? `${projectName}.x86_64` : platform === "macos" ? `${projectName}.app` : platform === "web" ? `${projectName}.zip` : `${projectName}.bin`;
  const output = join(outputDirectory, filename);
  let result;
  try {
    result = await taskContext.processes.execute(executable, [
      "--headless", "--path", project, "--export-release", preset, output,
    ], {
      cwd: project,
      signal: taskContext.signal,
      onStdout: (chunk) => taskContext.logStream("stdout", chunk),
      onStderr: (chunk) => taskContext.logStream("stderr", chunk),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Godot executable not found: ${executable}. Install Godot or configure its executable path.`);
    throw error;
  }
  if (result.exitCode !== 0) {
    const logs = `${result.stderr}\n${result.stdout}`;
    if (/export template/i.test(logs)) throw new Error(`Godot export templates are missing for preset "${preset}". Install the matching templates in Godot Editor > Manage Export Templates.`);
    throw new Error(`Godot export failed for preset "${preset}" (exit code ${String(result.exitCode)}). ${logs.trim() || "See the workflow log for details."}`);
  }
  if (platform === "web") {
    try {
      const archive = new AdmZip(output);
      const root = resolve(outputDirectory);
      for (const entry of archive.getEntries()) {
        const target = resolve(root, entry.entryName);
        if (target !== root && !target.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error(`Unsafe path in export archive: ${entry.entryName}`);
      }
      archive.extractAllTo(outputDirectory, true);
      await rm(output, { force: true });
    } catch (error) {
      throw new Error(`Godot web export did not produce a valid ZIP archive: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let size = 0;
  const hash = createHash("sha256");
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const file = await stat(path);
        size += file.size;
        hash.update(await readFile(path));
      }
    }
  };
  await visit(outputDirectory);
  if (!size) throw new Error(`Godot reported a successful export but produced no files for preset "${preset}".`);
  taskContext.setArtifact(outputId, outputDirectory, { size, checksum: hash.digest("hex"), name: `${projectName} ${platform}` });
  return { output: outputDirectory, outputDirectory, bundleDirectory: outputDirectory };
};
