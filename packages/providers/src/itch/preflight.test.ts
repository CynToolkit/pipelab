import { afterEach, describe, expect, it, vi } from "vitest";
import { checkItchPreflight } from "./export";

const answer = (me: unknown, games: unknown) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (url) => new Response(JSON.stringify(String(url).endsWith("/me") ? me : games)),
    );
const run = (project: string) =>
  checkItchPreflight({
    inputs: { accountConnectionId: "a", project },
    connectionValues: { a: { apiKey: "k" } },
    services: {},
  });

afterEach(() => vi.restoreAllMocks());

describe("itch preflight game check", () => {
  const me = { user: { username: "me" } };
  it("verifies a game the account owns", async () => {
    answer(me, { games: [{ url: "https://me.itch.io/my-game" }] });
    expect(await run("my-game")).toEqual({ status: "verified" });
  });
  it("fails a game the account does not have", async () => {
    answer(me, { games: [{ url: "https://me.itch.io/my-game" }] });
    expect((await run("12212")).status).toBe("failed");
  });
  it("does not block on an unreadable game list", async () => {
    answer(me, {});
    expect((await run("12212")).status).toBe("unverifiable");
  });
});
