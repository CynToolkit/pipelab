import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSteamCredentials } from "./upload-to-steam";
import { steamDestination } from "./index";

describe("Steam release credentials", () => {
  it("reports destination field paths", () => {
    const issues = steamDestination.validate(
      {
        id: "destination",
        provider: steamDestination.id,
        enabled: true,
        config: {},
        slots: [{ id: "windows", name: "Windows build", enabled: true, config: {} }],
      },
      { host: { platform: "linux", architecture: "x64" } },
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "config.accountConnectionId" }),
        expect.objectContaining({ path: "config.appId" }),
        expect.objectContaining({ path: "slots.windows.config.depotId" }),
      ]),
    );
    expect(issues.find((issue) => issue.code === "steam.depot.required")?.message).toBe(
      "Depot ID is required for Windows build.",
    );
  });

  it("resolves credentials by connection ID at execution time", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pipelab-steam-"));
    const path = join(directory, "connections.json");
    await writeFile(
      path,
      JSON.stringify({ connections: [{ id: "steam-1", username: "user", password: "pass" }] }),
    );
    await expect(resolveSteamCredentials(path, "steam-1", {})).resolves.toEqual({
      username: "user",
      password: "pass",
    });
  });
});
