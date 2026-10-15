import { describe, expect, it } from "vitest";
import { resolveSupabasePublishableKey } from "./supabase-key";

describe("resolveSupabasePublishableKey", () => {
  it("prefers the canonical publishable key when both variables are set", () => {
    expect(
      resolveSupabasePublishableKey({
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_current",
        SUPABASE_ANON_KEY: "legacy-anon-key",
      }),
    ).toBe("sb_publishable_current");
  });

  it("uses the legacy anon key during the compatibility window", () => {
    expect(resolveSupabasePublishableKey({ SUPABASE_ANON_KEY: "legacy-anon-key" })).toBe(
      "legacy-anon-key",
    );
  });

  it("returns an empty key when neither variable is configured", () => {
    expect(resolveSupabasePublishableKey({})).toBe("");
  });
});
