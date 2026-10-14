import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseAvailable, supabase } from "./supabase";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({}) as never),
}));

describe("Supabase client configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("is unavailable and creates no client when URL and keys are missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");

    expect(isSupabaseAvailable()).toBe(false);
    expect(supabase()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes the canonical key to Supabase when both names are set", () => {
    vi.stubEnv("SUPABASE_URL", "https://local.supabase.test");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_current");
    vi.stubEnv("SUPABASE_ANON_KEY", "legacy-anon-key");

    supabase();

    expect(createClient).toHaveBeenCalledWith(
      "https://local.supabase.test",
      "sb_publishable_current",
      undefined,
    );
  });

  it("passes the legacy key while the compatibility alias is enabled", () => {
    vi.stubEnv("SUPABASE_URL", "https://local.supabase.test");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "legacy-anon-key");

    supabase();

    expect(createClient).toHaveBeenCalledWith(
      "https://local.supabase.test",
      "legacy-anon-key",
      undefined,
    );
  });
});
