import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import AdmZip from "adm-zip";

export const godotTemplateDirectories = (platform: NodeJS.Platform, home = process.env.HOME ?? ""): string[] => {
  if (platform === "win32") return [join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Godot", "export_templates")];
  if (platform === "darwin") return [join(home, "Library", "Application Support", "Godot", "export_templates")];
  return [join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "godot", "export_templates")];
};

export const hasGodotTemplates = async (platform: NodeJS.Platform, home?: string): Promise<boolean> => {
  for (const directory of godotTemplateDirectories(platform, home)) {
    try {
      if ((await readdir(directory)).length > 0) return true;
    } catch { /* Try the next platform-specific location. */ }
  }
  return false;
};

export const godotPresetMatchesTarget = (presetPlatform: string, targetId: string): boolean => {
  const value = presetPlatform.toLowerCase();
  if (targetId.startsWith("windows-")) return value.includes("windows");
  if (targetId.startsWith("linux-")) return value.includes("linux") || value.includes("x11");
  if (targetId.startsWith("macos-")) return value.includes("mac") || value.includes("osx");
  return value.includes("web") || value.includes("html");
};

const run = (executable: string, args: string[], cwd: string, signal: AbortSignal, log: (stream: "stdout" | "stderr", chunk: string) => void): Promise<{ exitCode: number }> => new Promise((resolveRun, reject) => {
  const child = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const onAbort = () => child.kill();
  signal.addEventListener("abort", onAbort, { once: true });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; log("stdout", text); });
  child.stderr.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; log("stderr", text); });
  child.once("error", (error) => { signal.removeEventListener("abort", onAbort); reject(Object.assign(error, { output })); });
  child.once("close", (exitCode) => { signal.removeEventListener("abort", onAbort); resolveRun({ exitCode: exitCode ?? 1 }); });
});

export const exportGodotProject = async (options: { executable: string; project: string; preset: string; platform: string; projectName: string; outputDirectory: string; signal: AbortSignal; log: (stream: "stdout" | "stderr", chunk: string) => void; ensureDirectory: (path: string) => Promise<void>; }): Promise<{ path: string; size: number; checksum: string }> => {
  await rm(options.outputDirectory, { recursive: true, force: true });
  await options.ensureDirectory(options.outputDirectory);
  const name = options.projectName.replace(/[^a-zA-Z0-9_-]/g, "-");
  const filename = options.platform === "windows" ? `${name}.exe` : options.platform === "linux" ? `${name}.x86_64` : options.platform === "macos" ? `${name}.app` : `${name}.zip`;
  const output = join(options.outputDirectory, filename);
  let result: { exitCode: number };
  try {
    result = await run(options.executable, ["--headless", "--path", options.project, "--export-release", options.preset, output], options.project, options.signal, options.log);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Godot executable not found: ${options.executable}.`);
    throw error;
  }
  if (result.exitCode !== 0) throw new Error(`Godot export failed for preset "${options.preset}" (exit code ${result.exitCode}).`);
  if (options.platform === "web") {
    const archive = new AdmZip(output);
    const root = resolve(options.outputDirectory);
    for (const entry of archive.getEntries()) {
      const target = resolve(root, entry.entryName);
      if (target !== root && !target.startsWith(`${root}/`) && !target.startsWith(`${root}\\`)) throw new Error(`Unsafe path in export archive: ${entry.entryName}`);
    }
    archive.extractAllTo(options.outputDirectory, true);
    await rm(output, { force: true });
  }
  let size = 0;
  const hash = createHash("sha256");
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) { size += (await stat(path)).size; hash.update(await readFile(path)); }
    }
  };
  await visit(options.outputDirectory);
  if (!size) throw new Error(`Godot reported a successful export but produced no files for preset "${options.preset}".`);
  return { path: options.outputDirectory, size, checksum: hash.digest("hex") };
};
