import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPokiGame } from "./export";

const roots: string[] = [];
const loginRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), "poki-check-"));
  roots.push(root);
  await mkdir(join(root, "poki"));
  await writeFile(
    join(root, "poki", "auth.json"),
    JSON.stringify({ access_token: "old", refresh_token: "r" }),
  );
  return root;
};
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("verifyPokiGame", () => {
  // The shape Poki's game endpoint returns (JSON:API), trimmed.
  const gameAnswer = Response.json({ data: { type: "games", id: "g", attributes: {} } });

  it("verifies a game the login can open", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(gameAnswer.clone());
    expect(await verifyPokiGame(await loginRoot(), "g")).toEqual({ status: "verified" });
  });
  it("does not verify an answer in an unrecognized shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "ok" }));
    const result = await verifyPokiGame(await loginRoot(), "g");
    expect(result.status).toBe("unverifiable");
  });
  it("refreshes an expired token in memory and retries", async () => {
    const calls = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "new" }))
      .mockResolvedValueOnce(gameAnswer.clone());
    expect(await verifyPokiGame(await loginRoot(), "g")).toEqual({ status: "verified" });
    expect(calls).toHaveBeenCalledTimes(3);
  });
  it("fails a game the login cannot open", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 403 }));
    expect((await verifyPokiGame(await loginRoot(), "sdsd")).status).toBe("failed");
  });
  it("does not block on server trouble", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 502 }));
    expect((await verifyPokiGame(await loginRoot(), "g")).status).toBe("unverifiable");
  });
});
