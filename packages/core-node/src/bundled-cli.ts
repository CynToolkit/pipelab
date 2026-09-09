import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface BundledCli {
  packageDir: string;
  entryPoint: string;
  isLocal: false;
}

export const resolveBundledUiFolder = (cliDirname: string) => join(cliDirname, "ui");

const bundledCliCandidates = (resourcesPath: string) => [
  join(resourcesPath, "app.asar", "dist", "cli"),
  join(resourcesPath, "app", "dist", "cli"),
  join(resourcesPath, "dist", "cli"),
];

export async function resolveBundledCli(resourcesPath: string): Promise<BundledCli | null> {
  for (const packageDir of bundledCliCandidates(resourcesPath)) {
    const manifestPath = join(packageDir, "package.json");
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const configuredEntry =
      typeof manifest.bin === "string"
        ? manifest.bin
        : manifest.bin?.pipelab || manifest.bin?.plab || manifest.main;
    const entryPoint = join(packageDir, configuredEntry || "index.mjs");

    if (existsSync(entryPoint)) {
      return { packageDir, entryPoint, isLocal: false };
    }
  }

  return null;
}
