import { useLogger, isSupabaseAvailable, supabase } from "@pipelab/shared";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useAPI } from "@renderer/composables/api";
import { uiRuntimeMode } from "@renderer/composables/ui-runtime";
import { defineStore } from "pinia";
import { computed, readonly, Ref, ref, shallowRef, watch } from "vue";
import posthog from "posthog-js";
import { createEventHook } from "@vueuse/core";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { withRequestTimeout } from "@renderer/utils/request-timeout";

export type SubscriptionStatus = "idle" | "loading" | "ready" | "error";
type AuthActionResponse = {
  data: { user: User | null; session: Session | null };
  error: Error | null;
};

// Define a more comprehensive AuthStateType
export type AuthStateType =
  | "INITIALIZING" // App is checking for existing session
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "ERROR"
  | "AWAITING_VALIDATION"
  | "LOADING"; // Authentication action in progress

export const useAuth = defineStore("auth", () => {
  const logger = useLogger();
  const user = shallowRef<User>();
  const authState = ref<AuthStateType>("INITIALIZING") as Ref<AuthStateType>; // Start in INITIALIZING state
  const isAuthenticating = ref(false); // Track loading state for auth actions
  const errorMessage = ref<string | null>(); // For storing error messages to display to the user
  const subscriptions = ref<Subscription[]>([]); // Store user subscriptions
  const subscriptionError = ref<string>(); // Store subscription loading errors
  const subscriptionStatus = ref<SubscriptionStatus>("idle");
  const isLoadingSubscriptions = computed(() => subscriptionStatus.value === "loading");
  let subscriptionRequestId = 0;
  let inFlightSubscription:
    | { requestId: number; userId: string; promise: Promise<void> }
    | undefined;
  let initPromise: Promise<void> | undefined;
  let authRequestId = 0;
  const { isReady } = useAgentAvailability();
  const isHostedBrowser = uiRuntimeMode === "hosted";
  const browserClient = isHostedBrowser
    ? supabase({
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;
  const hasLoginProvider = isHostedBrowser ? browserClient !== null : isSupabaseAvailable();
  const isAuthTransportReady = computed(() => (isHostedBrowser ? hasLoginProvider : isReady.value));

  const callbackUrl = (type?: "recovery") => {
    const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL("/auth/callback", origin);
    if (type) url.searchParams.set("type", type);
    return url.toString();
  };

  const setUser = (nextUser?: User) => {
    const previousId = user.value?.id;
    user.value = nextUser;
    if (previousId !== nextUser?.id) {
      subscriptionRequestId++;
      subscriptions.value = [];
      subscriptionError.value = undefined;
      subscriptionStatus.value = "idle";
    }
  };

  const isAuthModalVisible = ref(false);
  const authModalTitle = ref<string>();
  const authModalSubTitle = ref<string>();

  const onAuthChanged = createEventHook<{ event: AuthChangeEvent; session: Session | null }>();
  const onSubscriptionChanged = createEventHook<{ subscriptions: Subscription[] }>();

  const api = useAPI();
  if (!isHostedBrowser)
    api.on("auth:getUser", (data) => {
      if (!isReady.value) return;
      authRequestId++;
      initPromise = undefined;
      logger.logger().info("[Auth] Received auth state change from backend:", data);
      if (data.type === "end" && data.data.type === "success" && data.data.result.user) {
        setUser(data.data.result.user);
        posthog.identify(data.data.result.user.id, {
          email: data.data.result.user.email,
          is_anonymous: data.data.result.user.is_anonymous || false,
        });
        authState.value = "SIGNED_IN";
        if (isReady.value) void fetchSubscription();
      } else {
        setUser(undefined);
        subscriptions.value = [];
        subscriptionError.value = undefined;
        subscriptionStatus.value = "ready";
        posthog.reset();
        authState.value = "SIGNED_OUT";
      }
    });

  const displayAuthModal = (title?: string, subtitle?: string) => {
    isAuthModalVisible.value = true;
    authModalTitle.value = title;
    authModalSubTitle.value = subtitle;
  };

  const hideAuthModal = () => {
    isAuthModalVisible.value = false;
    authModalTitle.value = undefined;
    authModalSubTitle.value = undefined;
  };

  const setAuthState = (state: AuthStateType) => {
    authState.value = state;
    logger.logger().debug(`[Auth State] Changed to: ${state}`);
  };

  const clearError = () => {
    errorMessage.value = null;
  };

  const invokeFunction = async (name: string, options?: { body?: Record<string, unknown> }) => {
    try {
      if (isHostedBrowser) {
        if (!browserClient) return { data: null, error: new Error("Supabase is not configured.") };
        const result = await withRequestTimeout(
          browserClient.functions.invoke(name, options),
          "Cloud request timed out. Please try again.",
        );
        return { data: result.data, error: result.error };
      }
      if (!isReady.value)
        return { data: null, error: new Error("Desktop agent is not connected.") };

      const result = await withRequestTimeout(
        api.execute("auth:invoke", { name, options }),
        "Cloud request timed out. Please try again.",
      );
      if (result.type === "error") return { data: null, error: new Error(result.ipcError) };
      const { data, error } = result.result;
      return { data, error: error ? new Error(error.message || "Cloud request failed.") : null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud request failed.";
      return { data: null, error: new Error(message) };
    }
  };

  const fetchSubscription = async () => {
    const currentUser = user.value;
    if (!currentUser || currentUser.is_anonymous) {
      subscriptions.value = [];
      subscriptionError.value = undefined;
      subscriptionStatus.value = currentUser ? "ready" : "idle";
      onSubscriptionChanged.trigger({ subscriptions: subscriptions.value });
      return;
    }
    if (!isAuthTransportReady.value) return;
    if (!currentUser.email) {
      subscriptionError.value = "User email not available";
      subscriptionStatus.value = "error";
      return;
    }
    if (inFlightSubscription?.userId === currentUser.id) return inFlightSubscription.promise;
    if (subscriptionStatus.value === "ready") return;

    const requestId = ++subscriptionRequestId;
    const userId = currentUser.id;
    subscriptionStatus.value = "loading";
    subscriptionError.value = undefined;

    const promise = (async () => {
      try {
        const { data, error } = await invokeFunction("polar-user-plan");
        if (error) throw error;
        if (
          !data ||
          typeof data !== "object" ||
          !("subscriptions" in data) ||
          !Array.isArray(data.subscriptions)
        ) {
          throw new Error("Invalid response: subscriptions is not an array");
        }
        if (requestId !== subscriptionRequestId || user.value?.id !== userId) return;
        subscriptions.value = data.subscriptions as Subscription[];
        subscriptionStatus.value = "ready";
      } catch (error) {
        if (requestId !== subscriptionRequestId || user.value?.id !== userId) return;
        subscriptionError.value = error instanceof Error ? error.message : "Unknown error";
        subscriptionStatus.value = "error";
      } finally {
        if (inFlightSubscription?.requestId === requestId) inFlightSubscription = undefined;
        if (requestId === subscriptionRequestId && user.value?.id === userId) {
          onSubscriptionChanged.trigger({ subscriptions: subscriptions.value });
        }
      }
    })();
    inFlightSubscription = { requestId, userId, promise };
    return promise;
  };

  const applyBrowserSession = (session: Session | null) => {
    const nextUser = session?.user;
    setUser(nextUser);
    if (nextUser) {
      posthog.identify(nextUser.id, {
        email: nextUser.email,
        is_anonymous: nextUser.is_anonymous || false,
      });
      authState.value = "SIGNED_IN";
      queueMicrotask(() => void fetchSubscription());
      return;
    }
    subscriptions.value = [];
    subscriptionError.value = undefined;
    subscriptionStatus.value = "ready";
    posthog.reset();
    authState.value = "SIGNED_OUT";
  };

  if (isHostedBrowser && browserClient) {
    browserClient.auth.onAuthStateChange((event, session) => {
      onAuthChanged.trigger({ event, session });
      if (event !== "INITIAL_SESSION") applyBrowserSession(session);
    });
  }

  // The backend now handles the auth state.
  // We will pull the user state during init and after each action.

  // Initialize auth only after the local agent is ready.
  const init = async () => {
    if (isHostedBrowser) {
      if (!browserClient) {
        setUser(undefined);
        subscriptions.value = [];
        subscriptionError.value = undefined;
        subscriptionStatus.value = "ready";
        errorMessage.value = "Browser authentication is not configured for this deployment.";
        authState.value = "ERROR";
        return;
      }
      if (initPromise) return initPromise;
      if (authState.value !== "INITIALIZING" && authState.value !== "ERROR") return;
      setAuthState("LOADING");
      const requestId = ++authRequestId;
      initPromise = (async () => {
        try {
          const { data, error } = await withRequestTimeout(
            browserClient.auth.getSession(),
            "Session restoration timed out. Try again.",
          );
          if (requestId !== authRequestId) return;
          if (error) throw error;
          applyBrowserSession(data.session);
          clearError();
        } catch {
          if (requestId !== authRequestId) return;
          setUser(undefined);
          authState.value = "ERROR";
          subscriptionStatus.value = "ready";
          errorMessage.value = "Unable to restore your browser session. Try again.";
        } finally {
          if (requestId === authRequestId) initPromise = undefined;
        }
      })();
      return initPromise;
    }

    if (!isSupabaseAvailable()) {
      setUser(undefined);
      subscriptions.value = [];
      subscriptionError.value = undefined;
      subscriptionStatus.value = "ready";
      authState.value = "SIGNED_OUT";
      return;
    }

    if (!isReady.value) return;
    if (initPromise) return initPromise;
    if (authState.value !== "INITIALIZING") {
      logger.logger().warn("[Auth] Init called when not in INITIALIZING state. Ignoring.");
      return; // Prevent duplicate init calls
    }
    logger.logger().info("[Auth] Initializing authentication...");
    setAuthState("LOADING"); // Set loading state during init
    const requestId = ++authRequestId;
    initPromise = (async () => {
      try {
        const result = await withRequestTimeout(
          api.execute("auth:getUser"),
          "Session restoration timed out. Try again.",
        );
        if (requestId !== authRequestId) return;
        if (result.type === "error") throw new Error(result.ipcError);
        if (result.type === "success" && result.result.user) {
          const currentUser = result.result.user;
          logger
            .logger()
            .info(
              "[Auth] Found existing user during init:",
              currentUser.id,
              "anonymous:",
              currentUser.is_anonymous,
              "email:",
              currentUser.email,
            );
          posthog.identify(currentUser.id, {
            email: currentUser.email,
            is_anonymous: currentUser.is_anonymous || false,
          });
          setUser(currentUser);
          authState.value = "SIGNED_IN";
          if (isReady.value) void fetchSubscription();
        } else {
          logger.logger().info("[Auth] No user found during init");
          posthog.identify();
          setUser(undefined);
          subscriptions.value = [];
          subscriptionError.value = undefined;
          subscriptionStatus.value = "ready";
          authState.value = "SIGNED_OUT";
        }
      } catch (e) {
        if (requestId !== authRequestId) return;
        logger.logger().error("[Auth] Unexpected error during init:", e);
        authState.value = "ERROR"; // Set error state if init fails unexpectedly
        errorMessage.value = "Failed to initialize authentication.";
      } finally {
        if (requestId === authRequestId) initPromise = undefined;
      }
    })();
    return initPromise;
  };

  watch(
    isReady,
    (ready) => {
      if (isHostedBrowser) {
        if (authState.value === "INITIALIZING") void init();
        return;
      }
      if (!ready) {
        authRequestId++;
        subscriptionRequestId++;
        initPromise = undefined;
        inFlightSubscription = undefined;
        subscriptions.value = [];
        subscriptionError.value = undefined;
        subscriptionStatus.value = "idle";
        isAuthenticating.value = false;
        authState.value = "INITIALIZING";
        return;
      }
      if (authState.value === "INITIALIZING") {
        void init();
      } else if (user.value && subscriptionStatus.value !== "ready") {
        void fetchSubscription();
      }
    },
    { immediate: true },
  );

  const login = async (email: string, pwd: string): Promise<AuthActionResponse> => {
    const requestId = ++authRequestId;
    initPromise = undefined;
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      let result: AuthActionResponse;
      if (isHostedBrowser) {
        if (!browserClient) throw new Error("Browser authentication is not configured.");
        result = await withRequestTimeout(
          browserClient.auth.signInWithPassword({ email, password: pwd }),
          "Sign-in timed out. Check your connection and try again.",
        );
      } else {
        const response = await withRequestTimeout(
          api.execute("auth:signInWithPassword", { email, password: pwd }),
          "Sign-in timed out. Check your connection and try again.",
        );
        result =
          response.type === "success"
            ? {
                data: { user: response.result.data.user, session: null },
                error: response.result.error,
              }
            : {
                data: { user: null, session: null },
                error: new Error(response.ipcError || "Sign-in failed."),
              };
      }
      if (requestId !== authRequestId) {
        return result;
      }

      if (result.error) {
        setAuthState("ERROR");
        errorMessage.value =
          result.error.message || "Sign-in failed. Check your details and try again.";
      } else {
        if (isHostedBrowser) {
          applyBrowserSession(result.data.session);
        } else {
          setUser(result.data.user ?? undefined);
          authState.value = result.data.user ? "SIGNED_IN" : "SIGNED_OUT";
          if (result.data.user) void fetchSubscription();
        }
      }
      return result;
    } catch (error) {
      if (requestId === authRequestId) {
        setAuthState("ERROR");
        errorMessage.value =
          error instanceof Error && /timed out/i.test(error.message)
            ? error.message
            : "Unable to sign in. Check your connection and try again.";
      }
      return {
        data: { user: null, session: null },
        error: error instanceof Error ? error : new Error("Sign-in failed."),
      };
    } finally {
      isAuthenticating.value = false;
    }
  };

  const register = async (email: string, pwd: string): Promise<AuthActionResponse> => {
    const requestId = ++authRequestId;
    initPromise = undefined;
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      let result: AuthActionResponse;
      if (isHostedBrowser) {
        if (!browserClient) throw new Error("Browser authentication is not configured.");
        result = await withRequestTimeout(
          browserClient.auth.signUp({
            email,
            password: pwd,
            options: { emailRedirectTo: callbackUrl() },
          }),
          "Registration timed out. Check your connection and try again.",
        );
      } else {
        const response = await withRequestTimeout(
          api.execute("auth:signUp", { email, password: pwd }),
          "Registration timed out. Check your connection and try again.",
        );
        result =
          response.type === "success"
            ? {
                data: { user: response.result.data.user, session: null },
                error: response.result.error,
              }
            : {
                data: { user: null, session: null },
                error: new Error(response.ipcError || "Registration failed."),
              };
      }

      if (requestId !== authRequestId) return result;
      if (result.error) {
        setAuthState("ERROR");
        errorMessage.value = result.error.message || "Failed to register. Please try again.";
      } else {
        if (isHostedBrowser && result.data.session) {
          applyBrowserSession(result.data.session);
        } else {
          setAuthState("AWAITING_VALIDATION");
        }
      }
      return result;
    } catch {
      if (requestId === authRequestId) {
        setAuthState("ERROR");
        errorMessage.value = "Unable to register. Check your connection and try again.";
      }
      return { data: { user: null, session: null }, error: new Error("Registration failed.") };
    } finally {
      isAuthenticating.value = false;
    }
  };

  const logout = async (): Promise<void> => {
    const requestId = ++authRequestId;
    initPromise = undefined;
    isAuthenticating.value = true; // Indicate loading during logout if needed
    setAuthState("LOADING"); // Optionally set authState to loading during logout
    clearError();
    try {
      if (isHostedBrowser) {
        if (!browserClient) throw new Error("Browser authentication is not configured.");
        const { error } = await withRequestTimeout(
          browserClient.auth.signOut(),
          "Sign-out timed out. Check your connection and try again.",
        );
        if (error) throw error;
      } else {
        const result = await withRequestTimeout(
          api.execute("auth:signOut"),
          "Sign-out timed out. Check your connection and try again.",
        );
        if (result.type === "error") throw new Error(result.ipcError || "Sign-out failed.");
      }
      if (requestId !== authRequestId) return;
      logger.logger().info("[Auth] Signed out.");
      user.value = undefined;
      posthog.reset();
      setAuthState("SIGNED_OUT");
      subscriptions.value = [];
      subscriptionError.value = undefined;
      subscriptionStatus.value = "ready";
      subscriptionRequestId++;
    } catch {
      if (requestId !== authRequestId) return;
      setAuthState("ERROR");
      errorMessage.value = "Failed to logout.";
    } finally {
      isAuthenticating.value = false;
    }
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
    authRequestId++;
    initPromise = undefined;
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      let error: Error | null;
      if (isHostedBrowser) {
        if (!browserClient) throw new Error("Browser authentication is not configured.");
        const result = await withRequestTimeout(
          browserClient.auth.resetPasswordForEmail(email, {
            redirectTo: callbackUrl("recovery"),
          }),
          "Password reset request timed out. Check your connection and try again.",
        );
        error = result.error;
      } else {
        const result = await withRequestTimeout(
          api.execute("auth:resetPasswordForEmail", { email }),
          "Password reset request timed out. Check your connection and try again.",
        );
        if (result.type === "error") throw new Error(result.ipcError || "Reset request failed.");
        error = result.result.error;
      }
      if (error) {
        setAuthState("ERROR");
        errorMessage.value = error.message || "Failed to send reset email.";
        return { error };
      } else {
        setAuthState("SIGNED_OUT"); // Reset to signed out state
        return { error: null };
      }
    } catch {
      setAuthState("ERROR");
      errorMessage.value = "Unable to send the reset email. Check your connection and try again.";
      return { error: new Error("Password reset failed.") };
    } finally {
      isAuthenticating.value = false;
    }
  };

  const updatePassword = async (password: string): Promise<{ error: Error | null }> => {
    if (!isHostedBrowser || !browserClient) {
      return { error: new Error("Password recovery is unavailable in this runtime.") };
    }
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      const { data, error } = await withRequestTimeout(
        browserClient.auth.updateUser({ password }),
        "Password update timed out. Check your connection and try again.",
      );
      if (error) {
        setAuthState("ERROR");
        errorMessage.value = error.message || "Unable to update your password.";
        return { error };
      }
      if (data.user) setUser(data.user);
      authState.value = "SIGNED_IN";
      return { error: null };
    } catch {
      setAuthState("ERROR");
      errorMessage.value = "Unable to update your password. Check your connection and try again.";
      return { error: new Error("Password update failed.") };
    } finally {
      isAuthenticating.value = false;
    }
  };

  const completeAuthCallback = async (
    code: string,
    type: "verification" | "recovery",
  ): Promise<{ error: Error | null }> => {
    if (!isHostedBrowser || !browserClient) {
      return { error: new Error("Browser authentication is unavailable in this runtime.") };
    }
    const requestId = ++authRequestId;
    initPromise = undefined;
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    let callbackEvent: AuthChangeEvent | undefined;
    const { data } = browserClient.auth.onAuthStateChange((event) => {
      callbackEvent = event;
    });
    try {
      const { data, error } = await withRequestTimeout(
        browserClient.auth.exchangeCodeForSession(code),
        "Account link verification timed out. Request a new link and try again.",
      );
      if (requestId !== authRequestId) return { error: new Error("Account link was cancelled.") };
      if (error) throw error;
      const expectedEvent = type === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN";
      if (!data.session || !data.user || callbackEvent !== expectedEvent) {
        throw new Error("Account link could not be verified.");
      }
      applyBrowserSession(data.session);
      return { error: null };
    } catch {
      if (requestId === authRequestId) {
        authState.value = "ERROR";
        errorMessage.value =
          "This account link is invalid or has expired. Request a new link and try again.";
      }
      return { error: new Error("Account link could not be verified.") };
    } finally {
      data.subscription.unsubscribe();
      if (requestId === authRequestId) isAuthenticating.value = false;
    }
  };

  const isLoggedIn = computed(() => authState.value === "SIGNED_IN");

  const benefits = {
    "cloud-save": "16955d3e-3e0f-4574-9093-87a32edf237c",
    "build-history": "b77e9800-8302-4581-8df3-6f1b979acef5",
    "multiple-projects": "ad00648e-ba6f-461a-87d0-84cabd53e489",
  };

  const devOverrides = ref<Record<string, string>>({});

  const loadDevOverrides = () => {
    if (process.env.NODE_ENV === "development") {
      const stored = localStorage.getItem("dev-benefits-overrides");
      if (stored) {
        devOverrides.value = JSON.parse(stored);
      }
    }
  };

  const saveDevOverrides = () => {
    if (process.env.NODE_ENV === "development") {
      localStorage.setItem("dev-benefits-overrides", JSON.stringify(devOverrides.value));
    }
  };

  const setDevOverride = (benefit: string, value: string) => {
    devOverrides.value[benefit] = value;
    saveDevOverrides();
  };

  const getActualBenefit = (benefit: keyof typeof benefits) => {
    // Check subscriptions for actual status
    return subscriptions.value.some((sub: any) =>
      sub.product.benefits.map((b: any) => b.id).includes(benefits[benefit]),
    );
  };

  const hasBenefit = (benefit: keyof typeof benefits) => {
    // Check dev overrides in development mode
    if (process.env.NODE_ENV === "development") {
      const override = devOverrides.value[benefit];
      if (override !== undefined) {
        switch (override) {
          case "force-on":
            return true;
          case "force-off":
            return false;
          case "actual":
          default:
            // Fall through to actual check
            break;
        }
      }
    }

    // Default behavior: check subscriptions
    const actual = getActualBenefit(benefit);
    return actual;
  };

  // Load overrides on store creation
  loadDevOverrides();

  const hasBuildHistoryBenefit = computed(() => hasBenefit("build-history"));
  const hasCloudSaveBenefit = computed(() => hasBenefit("cloud-save"));
  const hasMultipleProjectsBenefit = computed(() => hasBenefit("multiple-projects"));

  return {
    user,
    authState,
    isLoggedIn,
    isAuthenticating,
    hasLoginProvider,
    isAuthTransportReady,
    errorMessage,
    subscriptions: readonly(subscriptions),
    subscriptionError: readonly(subscriptionError),
    isLoadingSubscriptions,
    subscriptionStatus: readonly(subscriptionStatus),
    hasBenefit,
    getActualBenefit,
    devOverrides: readonly(devOverrides),
    setDevOverride,

    clearError,
    init, // Keep init for explicit re-initialization if needed, though generally called once on app start.
    login,
    register,
    logout,
    resetPassword,
    updatePassword,
    completeAuthCallback,
    fetchSubscription,
    invokeFunction,

    displayAuthModal,
    hideAuthModal,
    isAuthModalVisible,
    authModalTitle,
    authModalSubTitle,

    hasBuildHistoryBenefit,
    hasCloudSaveBenefit,
    hasMultipleProjectsBenefit,

    onAuthChanged: onAuthChanged.on,
    onSubscriptionChanged: onSubscriptionChanged.on,
  };
});
