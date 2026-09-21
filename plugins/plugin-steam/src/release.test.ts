import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSteamCredentials } from "./upload-to-steam";

describe("Steam release credentials", () => {
  it("resolves credentials by connection ID at execution time", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pipelab-steam-"));
    const path = join(directory, "connections.json");
    await writeFile(path, JSON.stringify({ connections: [{ id: "steam-1", username: "user", password: "pass" }] }));
    await expect(resolveSteamCredentials(path, "steam-1", {})).resolves.toEqual({ username: "user", password: "pass" });
  });
});
