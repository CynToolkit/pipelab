import { spawn } from "node:child_process";
import { cp, lstat, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = fileURLToPath(import.meta.url);
const desktopDir = path.resolve(path.dirname(scriptPath), "..");
const repoDir = path.resolve(desktopDir, "../..");
const stageRoot = path.join(repoDir, ".desktop-stage");
const stageDir = path.join(stageRoot, "app");
const stagedForgeOutput = path.join(stageRoot, "out");
const cliSource = path.join(repoDir, "apps", "cli", "dist");
const desktopOutput = path.join(desktopDir, "out");

const requiredCliFiles = ["package.json", "index.mjs", path.join("ui", "index.html")];

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      windowsVerbatimArguments: false,
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

export async function copyTreeWithoutSymlinks(source, target) {
  const sourceStats = await lstat(source);
  if (sourceStats.isSymbolicLink()) {
    throw new Error(`Refusing to copy symlink or junction: ${source}`);
  }
  if (!sourceStats.isDirectory()) {
    throw new Error(`Expected directory: ${source}`);
  }

  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const entryStats = await lstat(sourcePath);

    if (entryStats.isSymbolicLink()) {
      throw new Error(`Refusing to copy symlink or junction: ${sourcePath}`);
    }
    if (entryStats.isDirectory()) {
      await copyTreeWithoutSymlinks(sourcePath, targetPath);
    } else if (entryStats.isFile()) {
      await cp(sourcePath, targetPath);
    } else {
      throw new Error(`Unsupported filesystem entry: ${sourcePath}`);
    }
  }
}

export async function verifyBundledCli(cliDir) {
  for (const relativeFile of requiredCliFiles) {
    const filePath = path.join(cliDir, relativeFile);
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new Error(`Bundled CLI entry is not a file: ${filePath}`);
    }
  }
}

export async function verifyStageLinks(stage) {
  const nodeModules = path.join(stage, "node_modules");

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const entryStats = await lstat(entryPath);
      if (entryStats.isSymbolicLink()) {
        const target = await realpath(entryPath);
        if (!isWithin(stage, target)) {
          throw new Error(`Deployed dependency points outside the stage: ${entryPath} -> ${target}`);
        }
      } else if (entryStats.isDirectory()) {
        await visit(entryPath);
      }
    }
  }

  await visit(nodeModules);
}

async function prepareStage() {
  const expectedStage = path.join(repoDir, ".desktop-stage", "app");
  if (path.resolve(stageDir) !== path.resolve(expectedStage) || !isWithin(repoDir, stageDir)) {
    throw new Error(`Refusing to remove unexpected deployment path: ${stageDir}`);
  }

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  await run(pnpmCommand, ["--filter", "@pipelab/app", "deploy", stageDir], repoDir);
  await verifyStageLinks(stageDir);

  await copyTreeWithoutSymlinks(cliSource, path.join(stageDir, "dist", "cli"));
  await verifyBundledCli(path.join(stageDir, "dist", "cli"));
  await rm(stagedForgeOutput, { recursive: true, force: true });
}

async function moveOutputBack() {
  const stagedOutput = stagedForgeOutput;
  await stat(stagedOutput);
  await rm(desktopOutput, { recursive: true, force: true });

  try {
    await rename(stagedOutput, desktopOutput);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await cp(stagedOutput, desktopOutput, { recursive: true });
    await rm(stagedOutput, { recursive: true, force: true });
  }
}

async function main() {
  const [mode, ...rawForgeArgs] = process.argv.slice(2);
  const forgeArgs = rawForgeArgs[0] === "--" ? rawForgeArgs.slice(1) : rawForgeArgs;
  if (mode !== "make" && mode !== "package") {
    throw new Error("Usage: run-forge-deployed.mjs <make|package> [Forge arguments...]");
  }

  await prepareStage();
  await rm(desktopOutput, { recursive: true, force: true });

  try {
    await run(pnpmCommand, ["run", `${mode}:forge`, ...forgeArgs], stageDir);
    await moveOutputBack();
    await rm(stageRoot, { recursive: true, force: true });
  } catch (error) {
    console.error(`[Desktop packaging] Deployment preserved for diagnostics: ${stageDir}`);
    throw error;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
