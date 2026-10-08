<template>
  <section class="auth-callback" aria-labelledby="callback-title">
    <h1 id="callback-title">{{ title }}</h1>
    <p v-if="status === 'processing'" role="status">Checking your account link…</p>

    <form v-else-if="status === 'recovery'" class="recovery-form" @submit.prevent="savePassword">
      <p>Choose a new password for your Pipelab account.</p>
      <label for="new-password">New password</label>
      <Password
        id="new-password"
        v-model="password"
        :feedback="false"
        toggle-mask
        autocomplete="new-password"
        input-class="w-full"
        :disabled="isSaving"
      />
      <label for="confirm-password">Confirm new password</label>
      <Password
        id="confirm-password"
        v-model="confirmPassword"
        :feedback="false"
        toggle-mask
        autocomplete="new-password"
        input-class="w-full"
        :disabled="isSaving"
      />
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
      <Button type="submit" label="Update password" :loading="isSaving" />
    </form>

    <div v-else>
      <p :role="status === 'error' ? 'alert' : 'status'">{{ message }}</p>
      <Button
        v-if="status === 'verified' || status === 'updated'"
        label="Continue"
        @click="continueToApp"
      />
      <Button v-else label="Return to sign in" @click="returnToSignIn" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Password from "primevue/password";
import { useAuth } from "@renderer/store/auth";

type CallbackStatus = "processing" | "verified" | "recovery" | "updated" | "error";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const status = ref<CallbackStatus>("processing");
const password = ref("");
const confirmPassword = ref("");
const errorMessage = ref("");
const isSaving = ref(false);

const title = computed(() => {
  if (status.value === "recovery") return "Reset your password";
  if (status.value === "updated") return "Password updated";
  if (status.value === "verified") return "Email verified";
  if (status.value === "error") return "Account link unavailable";
  return "Verifying account link";
});

const message = computed(() => {
  if (status.value === "verified") return "Your Pipelab account is ready.";
  if (status.value === "updated") return "Your password has been updated.";
  return "This account link is invalid or has expired. Request a new link and try again.";
});

const clearCallbackParameters = async () => {
  if (Object.keys(route.query).length > 0 || route.hash) {
    await router.replace({ path: route.path });
  }
};

const processCallback = async () => {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get("code");
  const callbackError =
    url.searchParams.get("error") ||
    url.searchParams.get("error_description") ||
    hash.get("error");
  const isRecoveryLink =
    url.searchParams.get("type") === "recovery" || hash.get("type") === "recovery";
  await clearCallbackParameters();

  if (callbackError || !code) {
    status.value = "error";
    return;
  }

  const result = await auth.completeAuthCallback(
    code,
    isRecoveryLink ? "recovery" : "verification",
  );
  if (result.error) {
    status.value = "error";
    return;
  }
  status.value = isRecoveryLink ? "recovery" : "verified";
};

const savePassword = async () => {
  errorMessage.value = "";
  if (password.value.length < 10) {
    errorMessage.value = "Password must be at least 10 characters long.";
    return;
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = "Passwords do not match.";
    return;
  }

  isSaving.value = true;
  const result = await auth.updatePassword(password.value);
  isSaving.value = false;
  if (result.error) {
    errorMessage.value =
      "Unable to update your password. Request a new recovery link and try again.";
    return;
  }
  password.value = "";
  confirmPassword.value = "";
  status.value = "updated";
};

const continueToApp = () => void router.replace({ name: "Dashboard" });
const returnToSignIn = () => void router.replace({ name: "Dashboard" });

void processCallback().catch(() => {
  status.value = "error";
  void clearCallbackParameters();
});
</script>

<style scoped>
.auth-callback {
  max-width: 32rem;
  margin: 3rem auto;
  padding: 1.5rem;
  border: 1px solid var(--p-surface-200);
  border-radius: 0.75rem;
  background: var(--p-surface-0);
}

.recovery-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.error-message {
  color: var(--p-red-500);
}
</style>
