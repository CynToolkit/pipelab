import { useLogger } from "@pipelab/shared";
import { isSupabaseAvailable } from "@pipelab/shared";
import { AuthChangeEvent, Session, User, UserResponse } from "@supabase/supabase-js";
import { useAPI } from "@renderer/composables/api";
import { defineStore } from "pinia";
import { computed, readonly, Ref, ref, shallowRef } from "vue";
import posthog from "posthog-js";
import { email } from "valibot";
import { Subscription } from "@polar-sh/sdk/dist/commonjs/models/components/subscription";
import { createEventHook } from "@vueuse/core";

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

  const isAuthModalVisible = ref(false);
  const authModalTitle = ref<string>();
  const authModalSubTitle = ref<string>();

  const onAuthChanged = createEventHook<{ event: AuthChangeEvent; session: Session }>();
  const onSubscriptionChanged = createEventHook<{ subscriptions: Subscription[] }>();

  const api = useAPI();
  api.on("auth:getUser", (data) => {
    logger.logger().info("[Auth] Received auth state change from backend:", data);
    if (data.user) {
      user.value = data.user;
      posthog.identify(data.user.id, {
        email: data.user.email,
        is_anonymous: data.user.is_anonymous || false,
      });
      authState.value = "SIGNED_IN";
      fetchSubscription();
    } else {
      user.value = undefined;
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
    console.log("[Auth] fetchSubscription: Starting, setting isLoadingSubscriptions to true");
    isLoadingSubscriptions.value = true;
    subscriptionError.value = undefined;
    if (user.value) {
      if (user.value.email) {
        try {
          const result: any = await api.execute("auth:invoke", {
            name: "polar-user-plan",
          });
          if (result.type === "error") {
            throw new Error(result.ipcError || "Network error");
          }
          const { data, error } = result.result;
          if (error) {
            throw new Error(error.message || "Network error");
          }
          if (!data) {
            throw new Error("Invalid response: no data");
          }
          if (!Array.isArray(data.subscriptions)) {
            throw new Error("Invalid response: subscriptions is not an array");
          }
          console.log("Subscription result", result);
          subscriptions.value = data.subscriptions;
        } catch (error) {
          console.error("Failed to fetch subscription:", error);
          subscriptionError.value = error instanceof Error ? error.message : "Unknown error";
          subscriptions.value = [];
        }
      } else {
        console.warn("User email is not available, skipping subscription fetch.");
        subscriptionError.value = "User email not available";
        subscriptions.value = [];
      }
    } else {
      console.warn("User is anonymous, skipping subscription fetch.");
      subscriptionError.value = "User is anonymous";
      subscriptions.value = [];
    }
    console.log("[Auth] fetchSubscription: Completed, setting isLoadingSubscriptions to false");
    isLoadingSubscriptions.value = false;
    onSubscriptionChanged.trigger({ subscriptions: subscriptions.value });
  };

  // The backend now handles the auth state.
  // We will pull the user state during init and after each action.

  // Explicitly initialize the auth state when the store is created
  const init = async () => {
    if (!isSupabaseAvailable()) {
      return;
    }

    if (authState.value !== "INITIALIZING") {
      logger.logger().warn("[Auth] Init called when not in INITIALIZING state. Ignoring.");
      return; // Prevent duplicate init calls
    }
    logger.logger().info("[Auth] Initializing authentication...");
    setAuthState("LOADING"); // Set loading state during init
    try {
      const result = await api.execute("auth:getUser");
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
        user.value = currentUser;
        authState.value = "SIGNED_IN";
        await fetchSubscription();
      } else {
        logger.logger().info("[Auth] No user found during init");
        posthog.identify();
        authState.value = "SIGNED_OUT";
      }
    } catch (e) {
      logger.logger().error("[Auth] Unexpected error during init:", e);
      authState.value = "ERROR"; // Set error state if init fails unexpectedly
      errorMessage.value = "Failed to initialize authentication.";
    } finally {
      // Init is done
    }
  };

  const login = async (email: string, pwd: string): Promise<UserResponse> => {
    isAuthenticating.value = true;
    setAuthState("LOADING");
    clearError();
    try {
      const result = await api.execute("auth:signInWithPassword", {
        email,
        password: pwd,
      });

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
        user.value = data.user;
        setAuthState("SIGNED_IN");
        await fetchSubscription();
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
    isAuthenticating.value = true; // Indicate loading during logout if needed
    setAuthState("LOADING"); // Optionally set authState to loading during logout
    clearError();
    try {
      await api.execute("auth:signOut");
      logger.logger().info("[Auth] Signed out.");
      user.value = undefined;
      posthog.reset();
      setAuthState("SIGNED_OUT");
      subscriptions.value = [];
    } catch (error) {
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

  // Call init immediately when the store is created to check initial auth state
  init();

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

  const isLoadingSubscriptions = ref(false);

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
