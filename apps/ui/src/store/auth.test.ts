import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { User } from "@supabase/supabase-js";

const { execute, on, setReady, readinessRefs, supabaseAvailable } = vi.hoisted(() => ({
  execute: vi.fn(),
  on: vi.fn(),
  setReady: vi.fn(),
  readinessRefs: [] as Array<{ value: boolean }>,
  supabaseAvailable: vi.fn(() => true),
}));

vi.mock("@renderer/composables/api", () => ({ useAPI: () => ({ execute, on }) }));
vi.mock("@renderer/composables/useAgentAvailability", async () => {
  const { ref } = await import("vue");
  setReady.mockImplementation((value: boolean) => {
    for (const readinessRef of readinessRefs) readinessRef.value = value;
  });
  return {
    useAgentAvailability: () => {
      const isReady = ref(false);
      readinessRefs.push(isReady);
      return { isReady };
    },
  };
});
vi.mock("@pipelab/shared", () => ({
  useLogger: () => ({
    logger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
  isSupabaseAvailable: supabaseAvailable,
}));
vi.mock("posthog-js", () => ({ default: { identify: vi.fn(), reset: vi.fn() } }));

import { useAuth } from "./auth";

let activeAuthStore: ReturnType<typeof useAuth> | undefined;

const makeUser = (id: string): User =>
  ({ id, email: `${id}@example.com`, is_anonymous: false }) as User;

describe("auth startup and subscription loading", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    execute.mockReset();
    on.mockReset();
    readinessRefs.length = 0;
    setReady(false);
    supabaseAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    activeAuthStore?.$dispose();
    activeAuthStore = undefined;
  });

  it("keeps plan state unknown when the initial account lookup fails", async () => {
    execute.mockResolvedValue({ type: "error", ipcError: "Account unavailable" });
    const auth = useAuth();
    activeAuthStore = auth;
    setReady(true);
    await vi.waitFor(() => expect(auth.authState).toBe("ERROR"));
    expect(auth.subscriptionStatus).toBe("idle");
    expect(auth.subscriptions).toEqual([]);
  });

  it("waits for agent readiness and does not await subscription loading during init", async () => {
    let finishSubscription!: (value: unknown) => void;
    execute.mockImplementation((channel: string) => {
      if (channel === "auth:getUser") {
        return Promise.resolve({ type: "success", result: { user: makeUser("user-a") } });
      }
      return new Promise((resolve) => {
        finishSubscription = resolve;
      });
    });

    const auth = useAuth();
    activeAuthStore = auth;
    await nextTick();
    expect(execute).not.toHaveBeenCalled();

    setReady(true);
    await nextTick();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith("auth:getUser"));
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_IN"));

    expect(auth.subscriptionStatus).toBe("loading");
    expect(execute).toHaveBeenCalledTimes(2);

    finishSubscription({ type: "success", result: { data: { subscriptions: [] }, error: null } });
    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("ready"));
  });

  it("marks a settled signed-out auth lookup as having no subscriptions", async () => {
    execute.mockResolvedValue({ type: "success", result: { user: null } });
    const auth = useAuth();
    activeAuthStore = auth;

    setReady(true);
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_OUT"));

    expect(auth.subscriptionStatus).toBe("ready");
    expect(auth.subscriptions).toEqual([]);
  });

  it("preserves lookup errors and allows a failed plan check to be retried", async () => {
    let planCalls = 0;
    execute.mockImplementation((channel: string) => {
      if (channel === "auth:getUser") {
        return Promise.resolve({ type: "success", result: { user: makeUser("user-a") } });
      }
      planCalls++;
      if (planCalls === 1) {
        return Promise.resolve({
          type: "success",
          result: { data: null, error: { message: "Plan function is unavailable" } },
        });
      }
      return Promise.resolve({
        type: "success",
        result: { data: { subscriptions: [] }, error: null },
      });
    });

    const auth = useAuth();
    activeAuthStore = auth;
    setReady(true);

    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("error"));
    expect(auth.subscriptionError).toBe("Plan function is unavailable");
    expect(auth.subscriptions).toEqual([]);

    await auth.fetchSubscription();

    expect(auth.subscriptionStatus).toBe("ready");
    expect(auth.subscriptionError).toBeUndefined();
    expect(planCalls).toBe(2);
  });

  it("treats unavailable Supabase as a known signed-out state after agent readiness", async () => {
    supabaseAvailable.mockReturnValue(false);
    const auth = useAuth();
    activeAuthStore = auth;

    setReady(true);
    await nextTick();

    expect(execute).not.toHaveBeenCalled();
    expect(auth.authState).toBe("SIGNED_OUT");
    expect(auth.subscriptionStatus).toBe("ready");
    expect(auth.subscriptions).toEqual([]);
  });

  it("deduplicates concurrent requests and ignores results for a previous user", async () => {
    const resolveRequests: Array<(value: unknown) => void> = [];
    const authListener = vi.fn();
    on.mockImplementation((_channel: string, listener: (event: unknown) => void) => {
      authListener.mockImplementation(listener);
    });
    execute.mockImplementation((channel: string) => {
      if (channel === "auth:getUser") {
        return Promise.resolve({ type: "success", result: { user: makeUser("user-a") } });
      }
      return new Promise((resolve) => {
        resolveRequests.push(resolve);
      });
    });

    const auth = useAuth();
    activeAuthStore = auth;
    setReady(true);
    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("loading"));
    void auth.fetchSubscription();
    void auth.fetchSubscription();
    expect(execute.mock.calls.filter(([channel]) => channel === "auth:invoke")).toHaveLength(1);

    authListener({ type: "end", data: { type: "success", result: { user: makeUser("user-b") } } });
    await vi.waitFor(() =>
      expect(execute.mock.calls.filter(([channel]) => channel === "auth:invoke")).toHaveLength(2),
    );
    resolveRequests[0]({
      type: "success",
      result: { data: { subscriptions: [{ id: "stale-subscription" }] }, error: null },
    });
    await vi.waitFor(() => expect(auth.user?.id).toBe("user-b"));
    expect(auth.subscriptions).toEqual([]);
    expect(auth.subscriptionStatus).toBe("loading");
  });

  it("ignores an old auth lookup that resolves after reconnect", async () => {
    const authResolvers: Array<(value: unknown) => void> = [];
    let authListener: ((event: unknown) => void) | undefined;
    on.mockImplementation((_channel: string, listener: (event: unknown) => void) => {
      authListener = listener;
    });
    execute.mockImplementation((channel: string) => {
      if (channel === "auth:getUser") {
        return new Promise((resolve) => authResolvers.push(resolve));
      }
      return new Promise(() => {});
    });

    const auth = useAuth();
    activeAuthStore = auth;
    setReady(true);
    await vi.waitFor(() => expect(authResolvers).toHaveLength(1));
    setReady(false);
    await nextTick();
    expect(auth.authState).toBe("INITIALIZING");
    authListener?.({
      type: "end",
      data: { type: "success", result: { user: makeUser("offline-user") } },
    });
    expect(auth.user).toBeUndefined();

    setReady(true);
    await vi.waitFor(() => expect(authResolvers).toHaveLength(2));
    authResolvers[1]({ type: "success", result: { user: makeUser("current-user") } });
    await vi.waitFor(() => expect(auth.user?.id).toBe("current-user"));
    authResolvers[0]({ type: "success", result: { user: makeUser("stale-user") } });
    await nextTick();

    expect(auth.user?.id).toBe("current-user");
  });

  it("ignores an old subscription result that resolves after reconnect", async () => {
    const subscriptionResolvers: Array<(value: unknown) => void> = [];
    execute.mockImplementation((channel: string) => {
      if (channel === "auth:getUser") {
        return Promise.resolve({ type: "success", result: { user: makeUser("user-a") } });
      }
      return new Promise((resolve) => subscriptionResolvers.push(resolve));
    });

    const auth = useAuth();
    activeAuthStore = auth;
    setReady(true);
    await vi.waitFor(() => expect(subscriptionResolvers).toHaveLength(1));
    setReady(false);
    await nextTick();
    expect(auth.subscriptionStatus).toBe("idle");

    setReady(true);
    await vi.waitFor(() => expect(subscriptionResolvers).toHaveLength(2));
    subscriptionResolvers[1]({
      type: "success",
      result: { data: { subscriptions: [{ id: "current-subscription" }] }, error: null },
    });
    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("ready"));
    subscriptionResolvers[0]({
      type: "success",
      result: { data: { subscriptions: [{ id: "stale-subscription" }] }, error: null },
    });
    await nextTick();

    expect(auth.subscriptions).toEqual([{ id: "current-subscription" }]);
    expect(auth.subscriptionStatus).toBe("ready");
  });
});
