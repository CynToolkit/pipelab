import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRuntime } from "../../../web-runtime";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "electron-runtime-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("Electron input runtime detection", () => {
  it("accepts a generic HTML export", async () => {
    await writeFile(join(folder, "index.html"), "<h1>App</h1>");
    await expect(detectRuntime(folder)).resolves.toBeUndefined();
  });

  it("detects a Construct export", async () => {
    await writeFile(join(folder, "index.html"), "<h1>Game</h1>");
    await writeFile(join(folder, "data.json"), "{}");
    await expect(detectRuntime(folder)).resolves.toBe("construct");
  });

  it("rejects input without an HTML entry point", async () => {
    await expect(detectRuntime(folder)).rejects.toThrow("index.html");
  });

  it("rejects conflicting Construct offline support", async () => {
    await writeFile(join(folder, "index.html"), "<h1>Game</h1>");
    await writeFile(join(folder, "sw.js"), "");
    await writeFile(join(folder, "offline.json"), "{}");
    await expect(detectRuntime(folder)).rejects.toThrow("please disable offline");
  });
});
