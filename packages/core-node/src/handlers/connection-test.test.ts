import { describe, expect, it } from "vitest";
import type { ProviderDefinition } from "@pipelab/shared";
import type { PipelabContext } from "../context";
import type { ProviderServices } from "../workflow-tasks";
import { testConnection } from "./connection-test";

const context = {} as PipelabContext;
const providerWith = (
  test: NonNullable<ProviderDefinition<ProviderServices>["connectionTests"]>[string],
): ProviderDefinition<ProviderServices>[] => [
  {
    id: "p",
    name: "P",
    icon: { type: "icon", icon: "pi-x" },
    description: "",
    isOfficial: true,
    packageName: "p",
    connectionTests: { "@pipelab/plugin-x": test },
  },
];
const request = { pluginName: "@pipelab/plugin-x", values: { apiKey: "super-secret" } };

describe("testConnection", () => {
  it("is unverifiable for unknown providers and untestable types", async () => {
    const result = await testConnection([], context, request);
    expect(result).toEqual({
      status: "unverifiable",
      reason: "This connection type cannot be tested.",
    });
  });

  it("passes the connection values through", async () => {
    const providers = providerWith(async ({ values }) =>
      values.apiKey === "super-secret"
        ? { status: "verified" }
        : { status: "failed", message: "no" },
    );
    expect(await testConnection(providers, context, request)).toEqual({ status: "verified" });
  });

  it("redacts secrets from failures and thrown errors", async () => {
    const failing = providerWith(async () => ({ status: "failed", message: "bad super-secret" }));
    expect(await testConnection(failing, context, request)).toEqual({
      status: "failed",
      message: "bad ***",
    });
    const throwing = providerWith(async () => {
      throw new Error("boom super-secret");
    });
    expect(await testConnection(throwing, context, request)).toEqual({
      status: "unverifiable",
      reason: "boom ***",
    });
  });

  it("gives up on a hanging test instead of waiting", async () => {
    const hanging = providerWith(() => new Promise(() => {}));
    const result = await testConnection(hanging, context, request, 20);
    expect(result.status).toBe("unverifiable");
  });
});
