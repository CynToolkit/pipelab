import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setSession, invoke, replace } = vi.hoisted(() => ({
  setSession: vi.fn(),
  invoke: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/utils/supabase", () => ({
  supabase: {
    auth: { setSession },
    functions: { invoke },
  },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ replace }) }));
vi.mock("vue-confetti-explosion", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/auth/auth-sucess/SuccessState.vue", () => ({
  default: { template: "<div>{{ message }}</div>", props: ["message"] },
}));
vi.mock("@/components/auth/auth-sucess/ErrorState.vue", () => ({
  default: { template: "<div>{{ message }}</div>", props: ["message"] },
}));
vi.mock("@/components/auth/auth-sucess/LoadingState.vue", () => ({
  default: { template: "<div>{{ message }}</div>", props: ["message"] },
}));

import AuthSuccess from "./auth-success.vue";

describe("desktop auth verification return", () => {
  beforeEach(() => {
    setSession.mockReset().mockResolvedValue({
      data: { user: { id: "verified-user" } },
      error: null,
    });
    invoke.mockReset().mockResolvedValue({ data: {}, error: null });
    replace.mockReset().mockImplementation(async ({ hash }: { hash: string }) => {
      if (!hash) {
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
      }
    });
    window.history.replaceState(
      {},
      "",
      "/auth-success#access_token=access-secret&refresh_token=refresh-secret",
    );
  });

  it("clears verification credentials from the URL without logging session data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    mount(AuthSuccess);
    await flushPromises();

    expect(replace).toHaveBeenCalledWith({ hash: "" });
    expect(window.location.hash).toBe("");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-secret",
      refresh_token: "refresh-secret",
    });
    expect(invoke).toHaveBeenCalledWith("webhook-post-account-creation", {
      body: { id: "verified-user" },
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
