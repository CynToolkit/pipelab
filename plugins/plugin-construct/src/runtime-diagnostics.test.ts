import { expect, test } from "vitest";
import {
  parseLinuxMemoryInfo,
  formatRendererCrash,
  readLinuxMemorySnapshot,
  shouldRecordPlaywrightVideo,
} from "./runtime-diagnostics";

test("records Playwright video in development and CI only", () => {
  expect(shouldRecordPlaywrightVideo("development", false)).toBe(true);
  expect(shouldRecordPlaywrightVideo("production", true)).toBe(true);
  expect(shouldRecordPlaywrightVideo("production", false)).toBe(false);
});

test("parses available memory and free swap from Linux meminfo", () => {
  expect(parseLinuxMemoryInfo("MemTotal: 8000000 kB\nMemAvailable: 2097152 kB\nSwapTotal: 4000000 kB\nSwapFree: 524288 kB\n")).toEqual({
    availableMemoryKiB: 2097152,
    freeSwapKiB: 524288,
  });
});

test("does not parse incomplete or invalid Linux memory data", () => {
  expect(parseLinuxMemoryInfo("MemAvailable: 10 kB\n")).toBeNull();
  expect(parseLinuxMemoryInfo("MemAvailable: nope kB\nSwapFree: 10 kB\n")).toBeNull();
});

test("returns no memory snapshot off Linux or when proc data cannot be read", async () => {
  await expect(readLinuxMemorySnapshot("darwin", "/missing")).resolves.toBeNull();
  await expect(readLinuxMemorySnapshot("linux", "/missing")).resolves.toBeNull();
});

test("formats renderer crashes with current memory values when available", () => {
  expect(formatRendererCrash({ availableMemoryKiB: 458 * 1024, freeSwapKiB: 0 })).toContain("458 MiB available RAM");
  expect(formatRendererCrash(null)).toContain("memory details are unavailable");
});
