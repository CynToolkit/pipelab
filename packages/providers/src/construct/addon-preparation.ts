import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import StreamZip from "node-stream-zip";

export const PIPELAB_ADDON = {
  id: "pipelabv2",
  version: "2.5.1",
  sdkVersion: 2,
  url: "https://github.com/CynToolkit/construct-plugin/releases/download/v2.5.1/pipelabv2-2.5.1-sdk-v2.c3addon",
  sha256: "b637845e1f613ee465b8d2aec9152053191e0552618c568ff1463fdb0e81acfc",
} as const;

export type PipelabAddonRequirement = {
  version: string;
  sdkVersion: number;
};

export const getPipelabAddonRequirement = async (
  projectFile: string,
): Promise<PipelabAddonRequirement | undefined> => {
  const archive = new StreamZip.async({ file: projectFile, skipEntryNameValidation: true });
  try {
    const entry = await archive.entry("project.c3proj");
    if (!entry || entry.isDirectory) throw new Error("Project archive has no project.c3proj");
    const project: unknown = JSON.parse((await archive.entryData(entry)).toString("utf8"));
    if (!project || typeof project !== "object") {
      throw new Error("Project metadata is invalid");
    }
    const usedAddons = Reflect.get(project, "usedAddons");
    if (!Array.isArray(usedAddons)) return undefined;
    const addon = usedAddons.find(
      (candidate: unknown) =>
        candidate &&
        typeof candidate === "object" &&
        Reflect.get(candidate, "id") === PIPELAB_ADDON.id,
    );
    if (!addon) return undefined;
    const version = Reflect.get(addon, "version");
    const sdkVersion = Reflect.get(addon, "sdkVersion");
    if (Reflect.get(addon, "bundled") === true) return undefined;
    if (Reflect.get(addon, "bundled") !== false) {
      throw new Error(
        "Project metadata does not confirm that the Pipelab Construct addon is external; automatic installation was skipped.",
      );
    }
    if (version !== PIPELAB_ADDON.version || sdkVersion !== PIPELAB_ADDON.sdkVersion) {
      // Keep existing profile-based behavior for versions without a pinned,
      // verified package. Never install a different version over the one the
      // project declares; Construct will report a missing addon if needed.
      return undefined;
    }
    return { version, sdkVersion };
  } finally {
    await archive.close().catch(() => {});
  }
};

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

const verifyAddonMetadata = async (archivePath: string): Promise<void> => {
  const archive = new StreamZip.async({ file: archivePath });
  try {
    const entry = await archive.entry("addon.json");
    if (!entry || entry.isDirectory) throw new Error("Addon archive has no addon.json");
    const metadata: unknown = JSON.parse((await archive.entryData(entry)).toString("utf8"));
    if (
      !metadata ||
      typeof metadata !== "object" ||
      Reflect.get(metadata, "id") !== PIPELAB_ADDON.id ||
      Reflect.get(metadata, "version") !== PIPELAB_ADDON.version ||
      Reflect.get(metadata, "sdk-version") !== PIPELAB_ADDON.sdkVersion
    ) {
      throw new Error("Addon archive metadata did not match the pinned Pipelab addon");
    }
  } finally {
    await archive.close().catch(() => {});
  }
};

export const ensurePinnedPipelabAddon = async (
  cacheDirectory: string,
  abortSignal: AbortSignal,
  fetchAsset: typeof fetch = fetch,
): Promise<string> => {
  const destination = join(cacheDirectory, `pipelabv2-${PIPELAB_ADDON.version}-sdk-v2.c3addon`);
  await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
  await chmod(cacheDirectory, 0o700).catch(() => {});

  const existing = await readFile(destination).catch(() => undefined);
  if (existing && sha256(existing) === PIPELAB_ADDON.sha256) {
    await verifyAddonMetadata(destination);
    return destination;
  }
  if (existing) await rm(destination, { force: true });

  const response = await fetchAsset(PIPELAB_ADDON.url, { signal: abortSignal });
  if (!response.ok) {
    throw new Error(
      `Could not download the trusted Pipelab Construct addon (HTTP ${response.status})`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 25 * 1024 * 1024) {
    throw new Error("Trusted Pipelab Construct addon download exceeds the 25 MiB limit");
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > 25 * 1024 * 1024 || sha256(data) !== PIPELAB_ADDON.sha256) {
    throw new Error("Downloaded Pipelab Construct addon failed its pinned SHA-256 check");
  }

  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { mode: 0o600, flag: "wx" });
    await verifyAddonMetadata(temporary);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  return destination;
};
