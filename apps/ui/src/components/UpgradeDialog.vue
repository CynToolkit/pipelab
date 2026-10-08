<template>
  <p v-if="!auth.isAuthTransportReady" role="status">
    {{
      auth.hasLoginProvider
        ? "Reconnect the Desktop agent to load plans or upgrade."
        : "Browser authentication is not configured for this deployment."
    }}
  </p>
  <div class="upgrade-dialog" :inert="!auth.isAuthTransportReady">
    <div class="dialog-header">
      <h2>Upgrade Your Plan</h2>
      <p>Choose the plan that works best for you</p>
    </div>

    <p v-if="auth.subscriptionStatus !== 'ready'" role="status">
      {{
        auth.subscriptionStatus === "error"
          ? "Unable to check your current plan."
          : "Checking your current plan…"
      }}
      <button
        v-if="auth.isAuthTransportReady && auth.subscriptionStatus === 'error'"
        @click="auth.fetchSubscription()"
      >
        Retry plan check
      </button>
    </p>

    <div class="plans-container">
      <!-- Loading state -->
      <div v-if="isLoading" class="loading-state">
        <p>Loading plans...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="error-state">
        <p class="error-message">{{ error }}</p>
        <button class="retry-button" @click="fetchPlansFromPolar">Retry</button>
      </div>

      <!-- Plans display -->
      <template v-else>
        <div
          v-for="(plan, index) in plans"
          :key="index"
          class="plan-card"
          :class="{ placeholder: plan.name === 'Free' }"
        >
          <div class="plan-header">
            <h3>{{ plan.name }}</h3>
            <div v-for="(price, pIndex) in plan.prices" :key="pIndex">
              <span v-if="price.amountType === 'free'" class="price">Free</span>
              <span v-else-if="price.amountType === 'fixed'" class="price">
                {{ price.priceAmount / 100 }} {{ price.priceCurrency }} /
                {{ plan.recurringInterval }}
              </span>
            </div>
          </div>
          <div class="plan-features">
            <ul>
              <li v-for="(benefit, bIndex) in plan.benefits" :key="bIndex">
                {{ benefit.description }}
              </li>
            </ul>
          </div>
          <button
            class="plan-button"
            :disabled="isPlanDisabled(plan) || !auth.isAuthTransportReady"
            @click="handlePlanAction(plan)"
          >
            {{ getPlanButtonText(plan) }}
          </button>
        </div>
      </template>
    </div>

    <div class="dialog-footer"></div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import { useAuth } from "@renderer/store/auth";
import type { Product } from "@polar-sh/sdk/models/components/product";
import { openAsyncUrl } from "@renderer/utils/open-async-url";

type Plan = Product;

const emit = defineEmits(["close"]);
const auth = useAuth();

// State for plans, loading, and error
const plans = ref<Plan[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

// Function to fetch plans from polar.sh using the actual cloud function
const fetchPlansFromPolar = async () => {
  if (!auth.isAuthTransportReady) return;
  try {
    isLoading.value = true;
    error.value = null;

    const { data, error: invokeError } = await auth.invokeFunction("polar-available-plans");
    if (invokeError) throw invokeError;
    if (!data || typeof data !== "object" || !("plans" in data) || !Array.isArray(data.plans)) {
      throw new Error("Invalid plans response");
    }
    plans.value = data.plans as Plan[];
  } catch {
    error.value = "Failed to fetch plans. Please try again later.";
  } finally {
    isLoading.value = false;
  }
};

const isCurrentPlan = (plan: any) => {
  if (auth.subscriptionStatus !== "ready") return false;
  // If plan is Free, it's current if user has no subscriptions
  if (plan.name === "Free") {
    return auth.subscriptions.length === 0;
  }

  // For paid plans, check if user has a subscription to this product
  // Assuming plan.id corresponds to product_id
  return auth.subscriptions.some((sub) => {
    // Check both ID and name just to be safe, depending on what the API returns
    return sub.product.id === plan.id || sub.product.name === plan.name;
  });
};

const isPlanDisabled = (plan: any) => {
  if (!auth.isAuthTransportReady || auth.subscriptionStatus !== "ready") return true;
  // Always disable if it's the current plan
  if (isCurrentPlan(plan)) return true;

  // If not logged in, button is enabled (to allow login)
  if (!auth.isLoggedIn) return false;

  // If logged in and plan is Free (but not current, meaning user is on paid plan),
  // disable for now (downgrade flow)
  if (plan.name === "Free") return true;

  return false;
};

const getPlanButtonText = (plan: any) => {
  if (auth.subscriptionStatus !== "ready")
    return auth.subscriptionStatus === "error" ? "Plan unavailable" : "Checking plan…";
  if (isCurrentPlan(plan)) {
    return "Current Plan";
  }

  if (!auth.isLoggedIn) {
    return auth.hasLoginProvider ? "Login to Upgrade" : "Login Unavailable";
  }

  return `Upgrade to ${plan.name}`;
};

const handlePlanAction = (plan: any) => {
  if (!auth.isLoggedIn) {
    if (auth.hasLoginProvider) {
      auth.displayAuthModal("Login Required", "Please login or register to upgrade your plan.");
    }
    return;
  }

  upgradeToPlan(plan);
};

const upgradeToPlan = async (plan: any) => {
  if (!auth.isAuthTransportReady || auth.subscriptionStatus !== "ready") return;
  error.value = null;
  const result = await openAsyncUrl(async () => {
    const { data, error: invokeError } = await auth.invokeFunction("checkout", {
      body: { itemIds: [plan.id] },
    });
    const checkoutUrl =
      data && typeof data === "object" && "checkoutURL" in data ? data.checkoutURL : undefined;
    if (invokeError || typeof checkoutUrl !== "string") {
      return undefined;
    }
    return checkoutUrl;
  });
  if (result !== "opened") {
    error.value =
      result === "blocked"
        ? "Allow pop-ups to continue to checkout, then try again."
        : "Unable to start checkout. Please try again.";
  }
};

// Fetch plans when component is mounted
watch(
  () => auth.isAuthTransportReady,
  (ready) => {
    if (ready) void fetchPlansFromPolar();
  },
  { immediate: true },
);

const closeDialog = () => {
  emit("close");
};
</script>

<style lang="scss" scoped>
.upgrade-dialog {
  background: white;
  border-radius: 12px;
}

.loading-state,
.error-state {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.error-message {
  color: #ef4444;
  margin-bottom: 16px;
}

.retry-button {
  background-color: #6366f1;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #5856eb;
  }
}

.dialog-header {
  text-align: center;
  margin-bottom: 24px;

  h2 {
    font-size: 24px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
  }

  p {
    color: #666;
    font-size: 14px;
  }
}

.plans-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.plan-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  position: relative;

  &.placeholder {
    opacity: 0.7;
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .price {
      font-size: 14px;
      font-weight: 500;
      color: #6366f1;
    }
  }

  .plan-features {
    margin-bottom: 16px;

    ul {
      list-style: none;
      padding: 0;
      margin: 0;

      li {
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
        padding-left: 16px;
        position: relative;

        &::before {
          content: "•";
          position: absolute;
          left: 0;
          color: #6366f1;
        }
      }
    }
  }

  .plan-button {
    width: 100%;
    padding: 8px 16px;
    background-color: #6366f1;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: #5856eb;
    }

    &:disabled {
      background-color: #cbd5e1;
      cursor: not-allowed;
    }
  }
}

.dialog-footer {
  text-align: right;

  .close-button {
    background: none;
    border: 1px solid #d1d5db;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;

    &:hover {
      background-color: #f3f4f6;
    }
  }
}
</style>
