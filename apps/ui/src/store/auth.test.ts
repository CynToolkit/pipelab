import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { AUTH_REQUEST_TIMEOUT_MS } from "@renderer/utils/request-timeout";

const {
  execute,
  on,
  setReady,
  readinessRefs,
  supabaseAvailable,
  runtimeMode,
  browserClient,
  createBrowserClient,
} = vi.hoisted(() => {
  const browserClient = {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
    functions: { invoke: vi.fn() },
  };
  return {
    execute: vi.fn(),
    on: vi.fn(),
    setReady: vi.fn(),
    readinessRefs: [] as Array<{ value: boolean }>,
    supabaseAvailable: vi.fn(() => true),
    runtimeMode: { value: "agent" },
    browserClient,
    createBrowserClient: vi.fn<() => typeof browserClient | null>(() => browserClient),
  };
});

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
  supabase: createBrowserClient,
}));
vi.mock("@renderer/composables/ui-runtime", () => ({
  get uiRuntimeMode() {
    return runtimeMode.value;
  },
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
    runtimeMode.value = "agent";
    browserClient.auth.getSession
      .mockReset()
      .mockResolvedValue({ data: { session: null }, error: null });
    browserClient.auth.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    browserClient.auth.signInWithPassword.mockReset();
    browserClient.auth.signUp.mockReset();
    browserClient.auth.signOut.mockReset().mockResolvedValue({ error: null });
    browserClient.auth.resetPasswordForEmail.mockReset();
    browserClient.auth.updateUser.mockReset();
    browserClient.auth.exchangeCodeForSession.mockReset();
    browserClient.functions.invoke
      .mockReset()
      .mockResolvedValue({ data: { subscriptions: [] }, error: null });
    createBrowserClient.mockClear();
    createBrowserClient.mockReturnValue(browserClient);
  });

  afterEach(() => {
    vi.useRealTimers();
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

describe("hosted browser authentication", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    execute.mockReset();
    on.mockReset();
    readinessRefs.length = 0;
    setReady(false);
    supabaseAvailable.mockReturnValue(true);
    runtimeMode.value = "hosted";
    browserClient.auth.getSession
      .mockReset()
      .mockResolvedValue({ data: { session: null }, error: null });
    browserClient.auth.onAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    browserClient.auth.signInWithPassword.mockReset();
    browserClient.auth.signUp.mockReset();
    browserClient.auth.signOut.mockReset().mockResolvedValue({ error: null });
    browserClient.auth.resetPasswordForEmail.mockReset();
    browserClient.auth.updateUser.mockReset();
    browserClient.auth.exchangeCodeForSession.mockReset();
    browserClient.functions.invoke
      .mockReset()
      .mockResolvedValue({ data: { subscriptions: [] }, error: null });
    createBrowserClient.mockClear();
    createBrowserClient.mockReturnValue(browserClient);
  });

  afterEach(() => {
    activeAuthStore?.$dispose();
    activeAuthStore = undefined;
  });

  it("restores browser sessions and loads subscriptions without agent IPC", async () => {
    const user = makeUser("browser-user");
    browserClient.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: "access-token", refresh_token: "refresh-token" } },
      error: null,
    });
    const auth = useAuth();
    activeAuthStore = auth;

    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_IN"));
    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("ready"));

    expect(auth.user?.id).toBe("browser-user");
    expect(execute).not.toHaveBeenCalled();
    expect(browserClient.functions.invoke).toHaveBeenCalledWith("polar-user-plan", undefined);
  });

  it("signs up with a hosted callback URL without waiting for an agent", async () => {
    const user = makeUser("new-browser-user");
    browserClient.auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_OUT"));

    const result = await auth.register("new-browser-user@example.com", "StrongPassword1!");

    expect(result.error).toBeNull();
    expect(auth.authState).toBe("AWAITING_VALIDATION");
    expect(browserClient.auth.signUp).toHaveBeenCalledWith({
      email: "new-browser-user@example.com",
      password: "StrongPassword1!",
      options: { emailRedirectTo: "http://localhost/auth/callback" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("settles clearly when hosted auth configuration is missing", async () => {
    supabaseAvailable.mockReturnValue(false);
    createBrowserClient.mockReturnValue(null);
    const auth = useAuth();
    activeAuthStore = auth;

    await vi.waitFor(() => expect(auth.authState).toBe("ERROR"));

    expect(auth.errorMessage).toMatch(/not configured/i);
    expect(auth.subscriptionStatus).toBe("ready");
    expect(execute).not.toHaveBeenCalled();
  });

  it("logs in and signs out through browser auth without agent IPC", async () => {
    const user = makeUser("browser-user");
    const session = { user, access_token: "access-token", refresh_token: "refresh-token" };
    browserClient.auth.signInWithPassword.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_OUT"));

    const result = await auth.login("browser-user@example.com", "password");
    expect(result.error).toBeNull();
    expect(auth.user?.id).toBe("browser-user");
    expect(auth.authState).toBe("SIGNED_IN");

    await auth.logout();
    expect(browserClient.auth.signOut).toHaveBeenCalledOnce();
    expect(auth.user).toBeUndefined();
    expect(auth.authState).toBe("SIGNED_OUT");
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses the hosted recovery callback for password reset", async () => {
    browserClient.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_OUT"));

    await expect(auth.resetPassword("browser-user@example.com")).resolves.toEqual({ error: null });
    expect(browserClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "browser-user@example.com",
      { redirectTo: "http://localhost/auth/callback?type=recovery" },
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not apply a stale subscription result after a browser account change", async () => {
    const firstUser = makeUser("first-user");
    const secondUser = makeUser("second-user");
    const subscriptionResolvers: Array<(value: unknown) => void> = [];
    let authListener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
    browserClient.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: firstUser,
          access_token: "first-token",
          refresh_token: "first-refresh",
        },
      },
      error: null,
    });
    browserClient.auth.onAuthStateChange.mockImplementation((listener) => {
      authListener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    browserClient.functions.invoke.mockImplementation(
      () => new Promise((resolve) => subscriptionResolvers.push(resolve)),
    );

    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(subscriptionResolvers).toHaveLength(1));
    authListener?.("SIGNED_IN", {
      user: secondUser,
      access_token: "second-token",
      refresh_token: "second-refresh",
    } as Session);
    await vi.waitFor(() => expect(subscriptionResolvers).toHaveLength(2));

    subscriptionResolvers[0]({ data: { subscriptions: [{ id: "stale" }] }, error: null });
    await vi.waitFor(() => expect(auth.user?.id).toBe("second-user"));
    expect(auth.subscriptions).toEqual([]);
    expect(auth.subscriptionStatus).toBe("loading");

    subscriptionResolvers[1]({ data: { subscriptions: [{ id: "current" }] }, error: null });
    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("ready"));
    expect(auth.subscriptions).toEqual([{ id: "current" }]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("completes a recovery callback after the PKCE exchange produces a signed-in session", async () => {
    const user = makeUser("callback-user");
    let listeners: Array<(event: AuthChangeEvent, session: Session | null) => void> = [];
    browserClient.auth.onAuthStateChange.mockImplementation((listener) => {
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    browserClient.auth.exchangeCodeForSession.mockImplementation(async () => {
      for (const listener of listeners) {
        listener("SIGNED_IN", {
          user,
          access_token: "access",
          refresh_token: "refresh",
        } as Session);
      }
      return {
        data: {
          user,
          session: { user, access_token: "access", refresh_token: "refresh" },
        },
        error: null,
      };
    });

    const auth = useAuth();
    activeAuthStore = auth;
    await auth.init();
    await expect(auth.completeAuthCallback("callback-code")).resolves.toEqual({ error: null });
    expect(browserClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("callback-code");
    expect(auth.user?.id).toBe("callback-user");
  });

  it("rejects an invalid callback even when an existing browser session is present", async () => {
    const user = makeUser("existing-user");
    browserClient.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: "access", refresh_token: "refresh" } },
      error: null,
    });
    browserClient.auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("Invalid code"),
    });

    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_IN"));

    await expect(auth.completeAuthCallback("invalid-code")).resolves.toMatchObject({
      error: expect.any(Error),
    });
    expect(auth.authState).toBe("ERROR");
    expect(auth.user?.id).toBe("existing-user");
  });

  it("settles failed plan loads and allows an authenticated retry", async () => {
    const user = makeUser("browser-user");
    browserClient.auth.getSession.mockResolvedValue({
      data: {
        session: { user, access_token: "access-token", refresh_token: "refresh-token" },
      },
      error: null,
    });
    browserClient.functions.invoke
      .mockResolvedValueOnce({ data: null, error: new Error("Plan endpoint unavailable") })
      .mockResolvedValueOnce({ data: { subscriptions: [] }, error: null });

    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.subscriptionStatus).toBe("error"));
    expect(auth.subscriptionError).toBe("Plan endpoint unavailable");

    await auth.fetchSubscription();
    expect(auth.subscriptionStatus).toBe("ready");
    expect(browserClient.functions.invoke).toHaveBeenCalledTimes(2);
  });

  it("times out a stalled plan lookup and settles its loading state", async () => {
    const user = makeUser("browser-user");
    browserClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user,
        session: { user, access_token: "access-token", refresh_token: "refresh-token" },
      },
      error: null,
    });
    browserClient.functions.invoke.mockImplementation(() => new Promise(() => {}));
    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_OUT"));
    vi.useFakeTimers();

    await auth.login("browser-user@example.com", "password");
    expect(auth.subscriptionStatus).toBe("loading");
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);

    expect(auth.subscriptionStatus).toBe("error");
    expect(auth.subscriptionError).toMatch(/timed out/i);
  });

  it("times out a stalled sign-in and clears the auth loading state", async () => {
    browserClient.auth.signInWithPassword.mockImplementation(() => new Promise(() => {}));
    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_OUT"));
    vi.useFakeTimers();

    const login = auth.login("user@example.com", "password");
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);
    const result = await login;

    expect(result.error?.message).toMatch(/timed out/i);
    expect(auth.isAuthenticating).toBe(false);
    expect(auth.authState).toBe("ERROR");
  });

  it("settles failed browser sign-in and sign-out requests", async () => {
    const user = makeUser("browser-user");
    browserClient.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: "access-token", refresh_token: "refresh-token" } },
      error: null,
    });
    browserClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("Invalid login credentials"),
    });
    browserClient.auth.signOut.mockRejectedValue(new Error("Network unavailable"));

    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_IN"));

    const loginResult = await auth.login("browser-user@example.com", "wrong-password");
    expect(loginResult.error?.message).toBe("Invalid login credentials");
    expect(auth.authState).toBe("ERROR");
    expect(auth.isAuthenticating).toBe(false);

    await auth.logout();
    expect(auth.authState).toBe("ERROR");
    expect(auth.errorMessage).toBe("Failed to logout.");
    expect(auth.isAuthenticating).toBe(false);
  });

  it("invokes billing functions with the browser session and reports function errors", async () => {
    const user = makeUser("browser-user");
    browserClient.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: "access-token", refresh_token: "refresh-token" } },
      error: null,
    });
    const functionError = new Error("Portal is temporarily unavailable");
    browserClient.functions.invoke.mockResolvedValue({ data: null, error: functionError });

    const auth = useAuth();
    activeAuthStore = auth;
    await vi.waitFor(() => expect(auth.authState).toBe("SIGNED_IN"));

    const result = await auth.invokeFunction("customer-portal");

    expect(result).toEqual({ data: null, error: functionError });
    expect(browserClient.functions.invoke).toHaveBeenCalledWith("customer-portal", undefined);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("Desktop auth transport compatibility", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    execute.mockReset();
    on.mockReset();
    readinessRefs.length = 0;
    setReady(false);
    supabaseAvailable.mockReturnValue(true);
    runtimeMode.value = "agent";
    createBrowserClient.mockClear();
    createBrowserClient.mockReturnValue(browserClient);
  });

  afterEach(() => {
    activeAuthStore?.$dispose();
    activeAuthStore = undefined;
  });

  it("keeps sign-in and sign-out on the existing agent IPC channels", async () => {
    const user = makeUser("desktop-user");
    execute.mockImplementation(async (channel: string) => {
      if (channel === "auth:signInWithPassword") {
        return { type: "success", result: { data: { user, session: null }, error: null } };
      }
      if (channel === "auth:signOut") return { type: "success", result: null };
      return { type: "error", ipcError: "Unexpected channel" };
    });
    const auth = useAuth();
    activeAuthStore = auth;

    const result = await auth.login("desktop-user@example.com", "password");
    expect(result.error).toBeNull();
    expect(auth.user?.id).toBe("desktop-user");

    await auth.logout();

    expect(execute).toHaveBeenCalledWith("auth:signInWithPassword", {
      email: "desktop-user@example.com",
      password: "password",
    });
    expect(execute).toHaveBeenCalledWith("auth:signOut");
    expect(createBrowserClient).not.toHaveBeenCalled();
  });
});
