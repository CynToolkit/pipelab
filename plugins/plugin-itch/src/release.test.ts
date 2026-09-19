import { describe, expect, it, vi } from "vitest";
import { resolveItchUsername } from "./export";

describe("Itch release credentials", () => {
  it("resolves the username from the Itch profile endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { username: "builder" } }), { status: 200 })));
    await expect(resolveItchUsername("secret")).resolves.toBe("builder");
    vi.unstubAllGlobals();
  });
});
