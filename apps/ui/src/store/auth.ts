import { useLogger, isSupabaseAvailable } from "@pipelab/shared";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { AuthChangeEvent, Session, User, UserResponse } from "@supabase/supabase-js";
import { useAPI } from "@renderer/composables/api";
import { defineStore } from "pinia";
import { computed, readonly, Ref, ref, shallowRef, watch } from "vue";
import posthog from "posthog-js";
import { createEventHook } from "@vueuse/core";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";

export type SubscriptionStatus = "idle" | "loading" | "ready" | "error";

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

  const onAuthChanged = createEventHook<{ event: AuthChangeEvent; session: Session }>();
  const onSubscriptionChanged = createEventHook<{ subscriptions: Subscription[] }>();

  const api = useAPI();
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

  const fetchSubscription = async () => {
    const currentUser = user.value;
    if (!currentUser || currentUser.is_anonymous) {
      subscriptions.value = [];
      subscriptionError.value = undefined;
      subscriptionStatus.value = currentUser ? "ready" : "idle";
      onSubscriptionChanged.trigger({ subscriptions: subscriptions.value });
      return;
    }
    if (!isReady.value) return;
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
        const result = await api.execute("auth:invoke", { name: "polar-user-plan" });
        if (result.type === "error") throw new Error(result.ipcError || "Network error");
        const { data, error } = result.result;
        if (error) throw new Error(error.message || "Network error");
        if (!data || !Array.isArray(data.subscriptions)) {
          throw new Error("Invalid response: subscriptions is not an array");
        }
        if (requestId !== subscriptionRequestId || user.value?.id !== userId) return;
        subscriptions.value = data.subscriptions;
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

  // The backend now handles the auth state.
  // We will pull the user state during init and after each action.

  // Initialize auth only after the local agent is ready.
  const init = async () => {
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
        const result = await api.execute("auth:getUser");
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

  const login = async (email: string, pwd: string): Promise<UserResponse> => {
    const requestId = ++authRequestId;
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      const result = await api.execute("auth:signInWithPassword", {
        email,
        password: pwd,
      });
      if (requestId !== authRequestId) {
        return result.type === "success"
          ? result.result
          : ({ data: { user: null, session: null }, error: { message: result.ipcError } } as any);
      }

      if (result.type === "error") {
        logger.logger().error("[Auth] Login error:", result.ipcError);
        setAuthState("ERROR");
        errorMessage.value = result.ipcError || "Invalid login credentials.";
        return { data: { user: null, session: null }, error: { message: result.ipcError } } as any;
      }

      const { data, error } = result.result;
      if (error) {
        logger.logger().error("[Auth] Login error:", error);
        setAuthState("ERROR");
        errorMessage.value = "Invalid login credentials.";
        return result.result;
      } else {
        logger.logger().info("[Auth] Logged in user:", data.user.id);
        setUser(data.user ?? undefined);
        setAuthState("SIGNED_IN");
        void fetchSubscription();
        return result.result;
      }
    } finally {
      isAuthenticating.value = false;
    }
  };

  const register = async (email: string, pwd: string): Promise<UserResponse> => {
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      const result = await api.execute("auth:signUp", {
        email,
        password: pwd,
      });

      if (result.type === "error") {
        logger.logger().error("[Auth] Registration error:", result.ipcError);
        setAuthState("ERROR");
        errorMessage.value = result.ipcError || "Failed to register. Please try again.";
        return { data: { user: null, session: null }, error: { message: result.ipcError } } as any;
      }

      const { data, error } = result.result;
      if (error) {
        logger.logger().error("[Auth] Registration error:", error);
        setAuthState("ERROR");
        errorMessage.value = "Failed to register. Please try again.";
        return result.result;
      } else {
        // an email is sent, you must validate it
        logger.logger().info("[Auth] Registered new user:", data.user.id);
        setAuthState("AWAITING_VALIDATION");
        return result.result;
      }
    } finally {
      isAuthenticating.value = false;
    }
  };

  const logout = async (): Promise<void> => {
    const requestId = ++authRequestId;
    isAuthenticating.value = true; // Indicate loading during logout if needed
    setAuthState("LOADING"); // Optionally set authState to loading during logout
    clearError();
    try {
      await api.execute("auth:signOut");
      if (requestId !== authRequestId) return;
      logger.logger().info("[Auth] Signed out.");
      user.value = undefined;
      posthog.reset();
      setAuthState("SIGNED_OUT");
      subscriptions.value = [];
      subscriptionError.value = undefined;
      subscriptionStatus.value = "ready";
      subscriptionRequestId++;
    } catch (error) {
      if (requestId !== authRequestId) return;
      logger.logger().error("[Auth] Logout error:", error);
      setAuthState("ERROR");
      errorMessage.value = "Failed to logout.";
    } finally {
      isAuthenticating.value = false;
    }
  };

  const resetPassword = async (email: string): Promise<{ error: any }> => {
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      const result = await api.execute("auth:resetPasswordForEmail", { email });
      if (result.type === "error") {
        logger.logger().error("[Auth] Reset password error:", result.ipcError);
        setAuthState("ERROR");
        errorMessage.value = "Failed to send reset email.";
        return { error: { message: result.ipcError } };
      }

      const { error } = result.result;
      if (error) {
        logger.logger().error("[Auth] Reset password error:", error);
        setAuthState("ERROR");
        errorMessage.value = "Failed to send reset email.";
        return { error };
      } else {
        logger.logger().info("[Auth] Reset password email sent to:", email);
        setAuthState("SIGNED_OUT"); // Reset to signed out state
        return { error: null };
      }
    } finally {
      isAuthenticating.value = false;
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
    hasLoginProvider: isSupabaseAvailable(),
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
    fetchSubscription,

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
