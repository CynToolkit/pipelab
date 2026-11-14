import { afterEach, describe, expect, it, vi } from "vitest";
import { checkConstructPreflight, testConstructConnection } from "./preflight";

const login = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe("Construct account check", () => {
  it("verifies accepted credentials", async () => {
    login({ request: { status: "ok" }, response: { userID: 1, token: "t" } });
    await expect(
      testConstructConnection({ values: { username: "a", password: "b" }, services: {} }),
    ).resolves.toEqual({ status: "verified" });
  });

  it("fails rejected credentials", async () => {
    login({ request: { status: "error" } });
    const result = await testConstructConnection({
      values: { username: "a", password: "b" },
      services: {},
    });
    expect(result.status).toBe("failed");
  });

  it("does not block when Construct is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const result = await testConstructConnection({
      values: { username: "a", password: "b" },
      services: {},
    });
    expect(result.status).toBe("unverifiable");
  });

  it("checks the connection the step references", async () => {
    login({ request: { status: "ok" }, response: { token: "t" } });
    const result = await checkConstructPreflight({
      inputs: { accountConnectionId: "acc" },
      connectionValues: { acc: { username: "a", password: "b" } },
      services: {},
    });
    expect(result.status).toBe("verified");
  });

  it("fails a connection without credentials", async () => {
    const result = await checkConstructPreflight({
      inputs: { accountConnectionId: "acc" },
      connectionValues: { acc: {} },
      services: {},
    });
    expect(result.status).toBe("failed");
  });
});
