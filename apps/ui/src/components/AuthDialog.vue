<template>
  <Dialog
    v-model:visible="isAuthModalVisible"
    modal
    :style="{ width: '420px', maxWidth: '95vw' }"
    class="auth-dialog-custom"
  >
    <!-- Custom Header with Brand Mark and Dynamic Titles -->
    <template #header>
      <div class="flex flex-column align-items-center w-full pt-1 pb-0 relative">
        <!-- Glow Effect Backdrop -->
        <div class="brand-glow"></div>

        <!-- Floating Logo Icon -->
        <div
          class="brand-logo-container mb-2 flex align-items-center justify-content-center shadow-lg"
        >
          <img src="/icon.png" alt="Pipelab" class="brand-logo-img" />
        </div>

        <!-- Dynamic Title -->
        <h2 class="text-xl font-bold text-center m-0 text-color">
          {{
            authModalTitle
              ? authModalTitle
              : activeTab === "login"
                ? "Welcome Back"
                : activeTab === "register"
                  ? "Create Account"
                  : "Reset Password"
          }}
        </h2>

        <!-- Dynamic Subtitle -->
        <p class="text-sm text-center text-muted-color mt-0.5 mb-0 px-2 line-height-3">
          {{
            authModalSubTitle
              ? authModalSubTitle
              : activeTab === "login"
                ? "Sign in to access your automation pipelines"
                : activeTab === "register"
                  ? "Join Pipelab and streamline your desktop workflows"
                  : "Enter your email address to receive a recovery link"
          }}
        </p>
      </div>
    </template>

    <div class="auth-dialog-body px-2 py-2">
      <!-- Capsule Segmented Tabs Control (Hidden for Forgot Password state) -->
      <div v-if="activeTab !== 'forgot-password'" class="auth-tabs-pill mb-3">
        <!-- Sliding active indicator -->
        <div
          class="auth-tabs-slider"
          :style="{
            left: activeTab === 'login' ? '4px' : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
          }"
        ></div>
        <button
          type="button"
          class="auth-tab-btn"
          :class="{ 'active-tab': activeTab === 'login' }"
          @click="activeTab = 'login'"
        >
          Sign In
        </button>
        <button
          type="button"
          class="auth-tab-btn"
          :class="{ 'active-tab': activeTab === 'register' }"
          @click="activeTab = 'register'"
        >
          Register
        </button>
      </div>

      <!-- Auth Form wrapper -->
      <form @submit.prevent="onSubmit">
        <div
          class="auth-form-container"
          :class="{
            'login-active': activeTab === 'login',
            'register-active': activeTab === 'register',
            'forgot-password-active': activeTab === 'forgot-password',
          }"
        >
          <Transition name="form-fade" mode="out-in">
            <div :key="activeTab" class="form-content-pane">
              <!-- LOGIN MODE -->
              <div v-if="activeTab === 'login'" class="flex flex-column gap-2">
                <!-- EMAIL FIELD -->
                <div class="auth-input-group flex flex-column gap-1.5">
                  <label for="email">Email Address</label>
                  <div class="relative w-full">
                    <i class="mdi mdi-email-outline"></i>
                    <InputText
                      id="email"
                      v-model="emailModel"
                      v-bind="emailProps"
                      type="text"
                      class="w-full py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg focus:border-primary transition-all text-sm input-with-icon"
                      :invalid="!!errors.email"
                      placeholder="name@example.com"
                      :disabled="isAuthenticating"
                    />
                  </div>
                  <span
                    v-if="errors.email"
                    class="text-xs text-red-500 flex align-items-center gap-1 font-medium animate-fade-in"
                  >
                    <i class="mdi mdi-alert-circle-outline"></i> {{ errors.email }}
                  </span>
                </div>

                <!-- PASSWORD FIELD -->
                <div class="auth-input-group flex flex-column gap-1.5">
                  <div class="flex justify-content-between align-items-center">
                    <label for="password">Password</label>
                    <button
                      type="button"
                      class="forgot-password-link"
                      @click="activeTab = 'forgot-password'"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div class="relative w-full password-container">
                    <i class="mdi mdi-lock-outline"></i>
                    <Password
                      id="password"
                      v-model="passwordModel"
                      v-bind="passwordProps"
                      class="w-full"
                      input-class="w-full py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg focus:border-primary transition-all text-sm input-with-icon"
                      :invalid="!!errors.password"
                      placeholder="Enter password"
                      :toggle-mask="true"
                      :feedback="false"
                      :disabled="isAuthenticating"
                    />
                  </div>
                  <span
                    v-if="errors.password"
                    class="text-xs text-red-500 flex align-items-center gap-1 font-medium animate-fade-in"
                  >
                    <i class="mdi mdi-alert-circle-outline"></i> {{ errors.password }}
                  </span>
                </div>
              </div>

              <!-- REGISTER MODE -->
              <div v-else-if="activeTab === 'register'" class="flex flex-column gap-2">
                <!-- EMAIL FIELD -->
                <div class="auth-input-group flex flex-column gap-1.5">
                  <label for="email-reg">Email Address</label>
                  <div class="relative w-full">
                    <i class="mdi mdi-email-outline"></i>
                    <InputText
                      id="email-reg"
                      v-model="emailModel"
                      v-bind="emailProps"
                      type="text"
                      class="w-full py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg focus:border-primary transition-all text-sm input-with-icon"
                      :invalid="!!errors.email"
                      placeholder="name@example.com"
                      :disabled="isAuthenticating"
                    />
                  </div>
                  <span
                    v-if="errors.email"
                    class="text-xs text-red-500 flex align-items-center gap-1 font-medium animate-fade-in"
                  >
                    <i class="mdi mdi-alert-circle-outline"></i> {{ errors.email }}
                  </span>
                </div>

                <!-- PASSWORD FIELD -->
                <div class="auth-input-group flex flex-column gap-1.5">
                  <label for="password-reg">Password</label>
                  <div class="relative w-full password-container">
                    <i class="mdi mdi-lock-outline"></i>
                    <Password
                      id="password-reg"
                      v-model="passwordModel"
                      v-bind="passwordProps"
                      class="w-full"
                      input-class="w-full py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg focus:border-primary transition-all text-sm input-with-icon"
                      :invalid="!!errors.password"
                      placeholder="Enter password"
                      :toggle-mask="true"
                      :feedback="true"
                      :disabled="isAuthenticating"
                    >
                      <template #header>
                        <div
                          class="text-xs font-bold mb-2 text-muted-color uppercase tracking-wide"
                        >
                          Password Rules
                        </div>
                      </template>
                      <template #footer>
                        <div class="flex flex-column gap-1.5 pt-1 text-xs">
                          <div
                            v-for="req in passwordRequirements"
                            :key="req.label"
                            class="flex align-items-center gap-2 transition-all duration-200"
                            :class="req.isValid ? 'text-green-500 font-medium' : 'text-muted-color'"
                          >
                            <i
                              class="mdi"
                              :class="
                                req.isValid
                                  ? 'mdi-check-circle text-green-500'
                                  : 'mdi-circle-outline'
                              "
                            ></i>
                            <span class="requirement-text">{{ req.label }}</span>
                          </div>
                        </div>
                      </template>
                    </Password>
                  </div>
                  <span
                    v-if="errors.password"
                    class="text-xs text-red-500 flex align-items-center gap-1 font-medium animate-fade-in"
                  >
                    <i class="mdi mdi-alert-circle-outline"></i> {{ errors.password }}
                  </span>
                </div>

                <!-- CONFIRM PASSWORD FIELD -->
                <div class="auth-input-group flex flex-column gap-1.5">
                  <label for="confirmPassword">Confirm Password</label>
                  <div class="relative w-full password-container">
                    <i class="mdi mdi-lock-check-outline"></i>
                    <Password
                      id="confirmPassword"
                      v-model="confirmPasswordModel"
                      v-bind="confirmPasswordProps"
                      class="w-full"
                      input-class="w-full py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg focus:border-primary transition-all text-sm input-with-icon"
                      :invalid="!!errors.confirmPassword"
                      placeholder="Repeat password"
                      :toggle-mask="true"
                      :feedback="false"
                      :disabled="isAuthenticating"
                    />
                  </div>
                  <span
                    v-if="errors.confirmPassword"
                    class="text-xs text-red-500 flex align-items-center gap-1 font-medium animate-fade-in"
                  >
                    <i class="mdi mdi-alert-circle-outline"></i> {{ errors.confirmPassword }}
                  </span>
                </div>
              </div>

              <!-- FORGOT PASSWORD MODE -->
              <div v-else-if="activeTab === 'forgot-password'" class="flex flex-column gap-2">
                <!-- EMAIL FIELD -->
                <div class="auth-input-group flex flex-column gap-1.5">
                  <label for="email-reset">Email Address</label>
                  <div class="relative w-full">
                    <i class="mdi mdi-email-outline"></i>
                    <InputText
                      id="email-reset"
                      v-model="emailModel"
                      v-bind="emailProps"
                      type="text"
                      class="w-full py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg focus:border-primary transition-all text-sm input-with-icon"
                      :invalid="!!errors.email"
                      placeholder="name@example.com"
                      :disabled="isAuthenticating"
                    />
                  </div>
                  <span
                    v-if="errors.email"
                    class="text-xs text-red-500 flex align-items-center gap-1 font-medium animate-fade-in"
                  >
                    <i class="mdi mdi-alert-circle-outline"></i> {{ errors.email }}
                  </span>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex flex-column gap-2 mt-4">
          <Button
            type="submit"
            :label="submitButtonLabel"
            class="w-full py-2.5 text-base font-bold transition-all duration-150 primary-submit-btn"
            :loading="isAuthenticating"
          />

          <!-- BACK TO SIGN IN (Forgot Password Only) -->
          <Button
            v-if="activeTab === 'forgot-password'"
            text
            label="Back to Sign In"
            class="w-full text-sm font-semibold p-2"
            @click="activeTab = 'login'"
            :disabled="isAuthenticating"
          />
        </div>
      </form>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useAuth } from "@renderer/store/auth";
import { useLogger } from "@pipelab/shared";
import { storeToRefs } from "pinia";
import { useForm, type TypedSchema } from "vee-validate";
import { useToast } from "primevue/usetoast";
import { toTypedSchema } from "@vee-validate/valibot";
import { email, minLength, nonEmpty, object, pipe, regex, string } from "valibot";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import Button from "primevue/button";
import Dialog from "primevue/dialog";

interface AuthFormValues {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const auth = useAuth();
const { isAuthModalVisible, authModalTitle, authModalSubTitle, isAuthenticating, authState } =
  storeToRefs(auth);

const { logger } = useLogger();
const toast = useToast();

// Tab state: 'login' | 'register' | 'forgot-password'
const activeTab = ref<"login" | "register" | "forgot-password">("login");

// Reset to "login" when the dialog re-opens
watch(isAuthModalVisible, (visible) => {
  if (visible) {
    activeTab.value = "login";
    resetForm();
  }
});

// Dynamic validation schema
const validationSchema = computed<TypedSchema<AuthFormValues>>(() => {
  if (activeTab.value === "forgot-password") {
    return toTypedSchema(
      object({
        email: pipe(
          string("An email address is required"),
          nonEmpty("Email is required"),
          email("Invalid email"),
        ),
      }),
    );
  }

  if (activeTab.value === "register") {
    return toTypedSchema(
      object({
        email: pipe(
          string("An email address is required"),
          nonEmpty("Email is required"),
          email("Invalid email"),
        ),
        password: pipe(
          string("A password is required"),
          minLength(10, "Password must be at least 10 characters long"),
          regex(/[a-z]/, "Password must contain at least one lowercase letter"),
          regex(/[A-Z]/, "Password must contain at least one uppercase letter"),
          regex(/[0-9]/, "Password must contain at least one number"),
          regex(
            /[!@#$%^&*()_+-=[\]{};':"|\<>?,./`~.]/,
            "Password must contain at least one symbol",
          ),
        ),
        confirmPassword: pipe(
          string("Confirm password is required"),
          nonEmpty("Please confirm your password"),
        ),
      }),
    );
  }

  // default: login
  return toTypedSchema(
    object({
      email: pipe(
        string("An email address is required"),
        nonEmpty("Email is required"),
        email("Invalid email"),
      ),
      password: pipe(string("A password is required"), nonEmpty("Password is required")),
    }),
  );
});

// vee-validate setup
const { defineField, handleSubmit, errors, setFieldError, resetForm } = useForm<AuthFormValues>({
  validationSchema: validationSchema,
});

const [emailModel, emailProps] = defineField("email");
const [passwordModel, passwordProps] = defineField("password");
const [confirmPasswordModel, confirmPasswordProps] = defineField("confirmPassword");

// Clear form validations when tab changes
watch(activeTab, () => {
  resetForm();
});

// Password criteria checks
const passwordRequirements = computed(() => {
  const pwd = passwordModel.value || "";
  return [
    { label: "10+ Characters", isValid: pwd.length >= 10 },
    { label: "Lowercase letter", isValid: /[a-z]/.test(pwd) },
    { label: "Uppercase letter", isValid: /[A-Z]/.test(pwd) },
    { label: "Numeric digit", isValid: /[0-9]/.test(pwd) },
    { label: "Special symbol", isValid: /[!@#$%^&*()_+-=[\]{};':"|\<>?,./`~.]/.test(pwd) },
  ];
});

// Dynamic submit label
const submitButtonLabel = computed(() => {
  if (isAuthenticating.value) return "Authenticating...";
  switch (activeTab.value) {
    case "login":
      return "Sign In";
    case "register":
      return "Create Account";
    case "forgot-password":
      return "Send Reset Link";
    default:
      return "Submit";
  }
});

// Form submission handler
const onSuccess = async (values: any) => {
  try {
    if (activeTab.value === "register") {
      if (values.password !== values.confirmPassword) {
        setFieldError("confirmPassword", "Passwords do not match");
        return;
      }

      const { error } = await auth.register(values.email, values.password);
      if (error) {
        logger().error("Registration failed", error);
        toast.add({
          severity: "error",
          summary: "Failed to register",
          detail: error.message,
          life: 4000,
        });
      } else {
        isAuthModalVisible.value = false;
        toast.add({
          severity: "success",
          summary: "Successfully registered",
          detail: "A confirmation e-mail has been sent",
          life: 4000,
        });
      }
    } else if (activeTab.value === "forgot-password") {
      const { error } = await auth.resetPassword(values.email);
      if (error) {
        logger().error("Password reset request failed", error);
        toast.add({
          severity: "error",
          summary: "Failed to send reset email",
          detail: error.message,
          life: 4000,
        });
      } else {
        activeTab.value = "login";
        toast.add({
          severity: "success",
          summary: "Reset email sent",
          detail: "If an account with that email exists, we've sent you a password reset link.",
          life: 6000,
        });
      }
    } else {
      // login
      const { error } = await auth.login(values.email, values.password);
      if (error) {
        logger().error("Login failed", error);
        toast.add({
          severity: "error",
          summary: "Failed to login",
          detail: error.message,
          life: 4000,
        });
      } else {
        isAuthModalVisible.value = false;
        toast.add({
          severity: "success",
          summary: "Successfully logged in",
          detail: "Welcome back!",
          life: 4000,
        });
      }
    }
  } catch (err: any) {
    logger().error("Auth request error", err);
    toast.add({
      severity: "info",
      summary: "Notice",
      detail: err?.message || err || "An unexpected error occurred",
      life: 4000,
    });
  }
};

const onInvalidSubmit = ({ values, errors: submitErrors }: any) => {
  logger().warn("Form validation rejected", { values, errors: submitErrors });
};

const onSubmit = handleSubmit(onSuccess, onInvalidSubmit);
</script>

<style lang="scss" scoped>
/* ─── Premium Glassmorphism and Styling ────────────────── */
:deep(.auth-dialog-custom) {
  border-radius: 16px !important;
  border: 1px solid var(--p-surface-200) !important;
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.18) !important;
  overflow: hidden;
  background: var(--p-surface-0) !important;

  :root.dark & {
    border-color: var(--p-surface-800) !important;
    background: var(--p-surface-900) !important;
    box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.45) !important;
  }

  .p-dialog-header {
    background: transparent !important;
    border-bottom: none !important;
    padding-bottom: 0 !important;
  }

  .p-dialog-content {
    background: transparent !important;
    padding-top: 0 !important;
  }

  // Compact scaling for custom close button override
  .p-dialog-header-actions {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 10;
  }
}

/* Glow decoration backdrop */
.brand-glow {
  position: absolute;
  top: -60px;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(99, 102, 241, 0) 70%);
  filter: blur(8px);
  pointer-events: none;
  z-index: 0;

  :root.dark & {
    background: radial-gradient(circle, rgba(99, 102, 241, 0.28) 0%, rgba(99, 102, 241, 0) 70%);
  }
}

/* Floating brand mark */
.brand-logo-container {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid var(--p-surface-150);
  z-index: 1;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

  &:hover {
    transform: translateY(-2px) scale(1.05);
  }

  :root.dark & {
    background: var(--p-surface-950);
    border-color: var(--p-surface-800);
  }
}

.brand-logo-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

/* Segmented Pill Switcher */
.auth-tabs-pill {
  display: flex;
  position: relative;
  padding: 4px;
  border-radius: 9999px !important; /* Fully rounded capsule */
  background: var(--p-surface-100);
  border: 1px solid var(--p-surface-200);
  overflow: hidden;

  :root.dark & {
    background: var(--p-surface-850);
    border-color: var(--p-surface-800);
  }
}

.auth-tabs-slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 9999px !important; /* Fully rounded sliding pill */
  background: var(--p-surface-0) !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;

  :root.dark & {
    background: var(--p-surface-900) !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
  }
}

.auth-tab-btn {
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 8px 16px;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  cursor: pointer;
  z-index: 1;
  border-radius: 9999px !important;
  transition: all 0.2s ease;
  color: var(--p-text-muted-color) !important;
  flex: 1;
  text-align: center;
  user-select: none;

  &:hover {
    color: var(--p-text-color) !important;
  }

  &.active-tab {
    color: var(--p-text-color) !important;
    font-weight: 700;
  }
}

/* Input group stylings */
.auth-input-group {
  .relative {
    display: flex;
    align-items: center;
    position: relative;
    width: 100%;
  }

  label {
    font-family: inherit;
    font-size: 0.725rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--p-text-muted-color);
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  .relative > i.mdi {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--p-text-muted-color);
    font-size: 1.15rem;
    z-index: 5;
    pointer-events: none;
    line-height: 1;
  }
}

:deep(.input-with-icon) {
  padding-left: 2.6rem !important; /* spacing for absolute icon */
  font-family: inherit;
  color: var(--p-text-color) !important;
  width: 100%;
}

:deep(.password-container) {
  .p-password-input {
    width: 100%;
    padding-left: 2.6rem !important;
  }
}

.forgot-password-link {
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color) !important;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
}

/* Live password criteria */
.password-requirements {
  i {
    font-size: 14px;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

/* Primary Submit button theme */
.primary-submit-btn {
  background: var(--p-primary-color) !important;
  color: var(--p-primary-inverse-color) !important;
  border: none !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15) !important;

  &:hover {
    background: var(--p-primary-hover-color) !important;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25) !important;
  }

  &:active {
    transform: scale(0.99);
  }
}

/* Custom Fade Animation */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Height Transition Container */
.auth-form-container {
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  width: calc(100% + 8px);
  padding: 4px;
  margin: -4px;

  &.login-active {
    max-height: 240px;
  }

  &.register-active {
    max-height: 350px; /* Capped to match Email + Password + Confirm Password fields and any error states without scrollbars */
  }

  &.forgot-password-active {
    max-height: 130px;
  }
}

/* Form switch fade transition */
.form-fade-enter-active,
.form-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.form-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.form-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.requirement-text {
  font-size: 0.725rem;
  font-weight: 500;
  white-space: nowrap;
}

/* Hide PrimeVue default dialog scrollbars during transition animations */
:deep(.p-dialog-content) {
  overflow: hidden !important;
}

/* Custom styling inside the floating Password tooltip overlay */
:deep(.p-password-overlay) {
  padding: 10px 14px !important;
  border-radius: 8px !important;
  font-family: inherit;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
  z-index: 10000;

  :root.dark & {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
  }

  /* Style the PrimeVue strength meter bar */
  .p-password-meter {
    height: 4px !important;
    border-radius: 2px !important;
    margin-bottom: 8px !important;
  }

  /* Icons style inside password overlay check list */
  i.mdi {
    font-size: 13px !important;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
