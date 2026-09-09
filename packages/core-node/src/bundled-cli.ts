import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDev, projectRoot } from "./context";

export interface BundledCli {
  packageDir: string;
  entryPoint: string;
  isLocal: false;
}

export const resolveBundledUiFolder = (cliDirname: string) => join(cliDirname, "ui");

export function resolveBundledAsset(packageName: string, cliDirname?: string): string {
  const prefix = "@pipelab/asset-";
  if (!packageName.startsWith(prefix)) {
    throw new Error(`Unsupported bundled asset package: ${packageName}`);
  }

  const assetDir = `asset-${packageName.slice(prefix.length)}`;
  const candidates = cliDirname
    ? [join(cliDirname, "assets", assetDir)]
    : [
        process.env.PIPELAB_CLI_DIR
          ? join(process.env.PIPELAB_CLI_DIR, "assets", assetDir)
          : undefined,
        !isDev && process.argv[1] ? join(dirname(process.argv[1]), "assets", assetDir) : undefined,
        projectRoot ? join(projectRoot, "assets", assetDir) : undefined,
      ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }

  throw new Error(
    `Bundled asset ${packageName} was not found. Expected it under the CLI assets directory.`,
  );
}

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
