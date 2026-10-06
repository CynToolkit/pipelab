import { readFile } from "node:fs/promises";

export type LinuxMemorySnapshot = {
  availableMemoryKiB: number;
  freeSwapKiB: number;
};

export const shouldRecordPlaywrightVideo = (nodeEnv: string | undefined, isCI: boolean) =>
  nodeEnv === "development" || isCI;

export const parseLinuxMemoryInfo = (contents: string): LinuxMemorySnapshot | null => {
  const values = new Map<string, number>();
  for (const line of contents.split("\n")) {
    const match = line.match(/^(MemAvailable|SwapFree):\s+(\d+)\s+kB$/);
    if (match) values.set(match[1], Number(match[2]));
  }

  const availableMemoryKiB = values.get("MemAvailable");
  const freeSwapKiB = values.get("SwapFree");
  if (availableMemoryKiB === undefined || freeSwapKiB === undefined) return null;
  return { availableMemoryKiB, freeSwapKiB };
};

export const readLinuxMemorySnapshot = async (
  currentPlatform = process.platform,
  meminfoPath = "/proc/meminfo",
): Promise<LinuxMemorySnapshot | null> => {
  if (currentPlatform !== "linux") return null;
  try {
    return parseLinuxMemoryInfo(await readFile(meminfoPath, "utf8"));
  } catch {
    return null;
  }
};

const mib = (kib: number) => Math.floor(kib / 1024);

export const formatRendererCrash = (snapshot: LinuxMemorySnapshot | null) =>
  `Chromium's renderer crashed during Construct export. Resource pressure is a likely cause (${snapshot ? `${mib(snapshot.availableMemoryKiB)} MiB available RAM, ${mib(snapshot.freeSwapKiB)} MiB free swap` : "memory details are unavailable"}). Stop other memory-heavy processes and retry.`;
