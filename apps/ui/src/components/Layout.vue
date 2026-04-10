<template>
  <div class="layout">
    <div class="header">
      <div class="bold title">{{ headerSentence }}</div>

      <div class="button">
        <Button link class="list-item" @click="toggleAccountMenu">
          <i class="icon mdi mdi-account fs-24"></i>
        </Button>
        <Menu ref="$menu" :model="accountMenuItems" :popup="true">
          <template #item="{ item, props }">
            <a v-bind="props.action" class="flex justify-content-between align-items-center w-full p-2">
              <div class="flex align-items-center">
                <i v-if="item.icon" :class="[item.icon, 'mr-2']"></i>
                <span>{{ item.label }}</span>
              </div>
              <i
                v-if="item.class === 'copiable-version'"
                class="mdi mdi-content-copy text-xs opacity-50 ml-4"
              ></i>
            </a>
          </template>
        </Menu>
      </div>
    </div>
    <div class="content">
      <slot></slot>
    </div>
    <div class="footer">
      <div class="flex gap-2 align-items-center">
        <UpgradeNowButton v-if="!isLoadingSubscriptions" @open-upgrade-dialog="openUpgradeDialog" />
        <div class="connection-status" :class="connectionState">
          <i class="mdi" :class="connectionIcon"></i>
          {{ connectionText }}
        </div>
      </div>

      <div>
        <div class="update-status">{{ updateStatusText }}</div>
        <div class="version-text">{{ appVersion }}</div>
      </div>
    </div>

    <Dialog
      v-model:visible="isAuthModalVisible"
      modal
      :style="{ width: '30vw' }"
      :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">
            {{
              authModalTitle
                ? authModalTitle
                : type === "login"
                  ? "Login"
                  : type === "register"
                    ? "Register"
                    : "Forgot Password"
            }}
          </p>
          <p class="text-center">{{ authModalSubTitle }}</p>
        </div>
      </template>

      <div v-if="type === 'login'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true,
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="username-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Password
                    id="password1"
                    v-model="passwordModel"
                    v-bind="passwordProps"
                    placeholder="Password"
                    :toggle-mask="true"
                    :feedback="false"
                    :invalid="!!errors.password"
                    :class="{
                      'w-full': true,
                    }"
                    input-class="w-full"
                  >
                  </Password>

                  <small v-if="errors.password" class="p-error">
                    {{ errors.password }}
                  </small>

                  <div class="mb-2"></div>

                  <div class="flex align-items-center justify-content-between mb-5">
                    <Button text @click="type = 'forgot-password'"> Forgot password? </Button>
                  </div>

                  <Button
                    type="submit"
                    label="Sign In"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    :loading="isAuthenticating"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Don't have an account?"
                    class="w-full p-3 text-lg"
                    @click="type = 'register'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div v-if="type === 'register'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true,
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="username-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Password
                    id="password1"
                    v-model="passwordModel"
                    v-bind="passwordProps"
                    placeholder="Password"
                    :toggle-mask="true"
                    :invalid="!!errors.password"
                    :class="{
                      'w-full': true,
                    }"
                    input-class="w-full"
                  >
                    <template #header>
                      <div class="text-lg font-bold mb-3">Pick a password</div>
                    </template>

                    <!-- @vue-expect-error -->
                    <template #footer="sp">
                      <!-- @vue-expect-error -->
                      {{ sp.level }}
                      <Divider />
                      <ul class="pl-2 ml-2 mt-0 line-height-3">
                        <li>At least one lowercase</li>
                        <li>At least one uppercase</li>
                        <li>At leaset one numeric</li>
                        <li>Minimum 10 characters</li>
                      </ul>
                    </template>
                  </Password>

                  <small v-if="errors.password" class="p-error">
                    {{ errors.password }}
                  </small>

                  <div class="mb-2"></div>

                  <div class="flex align-items-center justify-content-between mb-5">
                    <Button text @click="type = 'forgot-password'"> Forgot password? </Button>
                  </div>

                  <Button
                    type="submit"
                    label="Sign Up"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    :loading="authState === 'LOADING'"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Already have an account?"
                    class="w-full p-3 text-lg"
                    @click="type = 'login'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div v-if="type === 'forgot-password'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="reset-mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true,
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="reset-mail-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Button
                    type="submit"
                    label="Send Reset Email"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    :loading="authState === 'LOADING'"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Back to Login"
                    class="w-full p-3 text-lg"
                    @click="type = 'login'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="isSettingsModalVisible"
      modal
      :style="{ width: '75vw', height: '80%' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">Settings</p>
        </div>
      </template>

      <Settings></Settings>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from "vue";
import { useAuth } from "@renderer/store/auth";
interface MenuItem {
  label?: string;
  icon?: string;
  command?: (event: any) => void;
  url?: string;
  items?: MenuItem[];
  disabled?: boolean;
  visible?: boolean;
  target?: string;
  separator?: boolean;
  style?: any;
  class?: any;
  key?: string;
}
import { useLogger } from "@pipelab/shared";
import Settings from "@renderer/components/Settings.vue";
import UpgradeNowButton from "@renderer/components/UpgradeNowButton.vue";
import { useToast } from "primevue/usetoast";
import Menu from "primevue/menu";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { UpdateStatus } from "@pipelab/shared";
import { email, minLength, nonEmpty, object, pipe, regex, string } from "valibot";
import { toTypedSchema } from "@vee-validate/valibot";
import posthog from "posthog-js";
import { storeToRefs } from "pinia";
import { handle } from "@renderer/composables/handlers";
import { useForm } from "vee-validate";
import { useRoute } from "vue-router";
import { websocketManager } from "@renderer/composables/websocket-manager";

const { logger } = useLogger();
const route = useRoute();

const isElectron = !!window.electron;

const openUpgradeDialog = inject("openUpgradeDialog") as () => void;

const $menu = ref();

const headerSentence = computed(() => {
  return route.meta?.title as string;
});

const updateStatus = ref<UpdateStatus>("update-not-available");

const appVersion = ref(window.version);
const agentVersion = ref("...");
const uiVersion = process.env.UI_VERSION;
// @ts-expect-error - pipelab is added in the preload
const electronVersion = window.pipelab?.versions?.electron || "N/A";

const updateVersions = async () => {
  if (websocketManager.isConnected()) {
    try {
      const response = await websocketManager.send("agent:version:get");
      if (response.type === "success") {
        agentVersion.value = response.result.version;
      }
    } catch (error) {
      console.error("Failed to fetch agent version:", error);
      agentVersion.value = "Unknown";
    }
  } else {
    agentVersion.value = "...";
  }
};

websocketManager.onStateChange((state) => {
  if (state === "connected") {
    updateVersions();
  } else {
    agentVersion.value = "...";
  }
});

// Initial fetch if already connected
if (websocketManager.isConnected()) {
  updateVersions();
}

posthog.register({
  "app-version": appVersion.value,
  "agent-version": agentVersion.value,
  "ui-version": uiVersion,
  "electron-version": electronVersion,
});

const connectionState = computed(() => websocketManager.connectionState.value);

const connectionIcon = computed(() => {
  switch (connectionState.value) {
    case "connected":
      return "mdi-lan-connect";
    case "connecting":
      return "mdi-lan-pending";
    case "disconnected":
      return "mdi-lan-disconnect";
    case "error":
      return "mdi-lan-disconnect";
    default:
      return "mdi-lan-disconnect";
  }
});

const connectionText = computed(() => {
  switch (connectionState.value) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Connection Error";
    default:
      return "Disconnected";
  }
});

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case "update-not-available":
      return "";
    case "update-available":
      return "Update available, downloading...";
    case "update-downloaded":
      return "Update downloaded";
    case "checking-for-update":
      return "Checking for update...";
    case "error":
      return "Error";
    default:
      return "";
  }
});

const toggleAccountMenu = (event: MouseEvent) => {
  $menu.value.toggle(event);
};

const type = ref<"login" | "register" | "forgot-password">("login");

const logout = async () => {
  await auth.logout();
};

const auth = useAuth();
const {
  user,
  authState,
  isAuthModalVisible,
  authModalTitle,
  authModalSubTitle,
  isLoadingSubscriptions,
  isAuthenticating,
} = storeToRefs(auth);

const isSettingsModalVisible = ref(false);

const accountMenuItems = computed(() => {
  const items: MenuItem[] = [];

  if (user.value) {
    items.push(
      {
        label: user.value.email,
        icon: "mdi mdi-email",
        disabled: true,
      },
      {
        label: "Profile",
        icon: "mdi mdi-account",
        disabled: true,
      },
      {
        label: "Team",
        icon: "mdi mdi-account-multiple",
        disabled: true,
      },
      {
        separator: true,
      },
      {
        label: "Logout",
        icon: "mdi mdi-logout",
        disabled: false,
        command: async () => {
          await logout();
        },
      },
    );
  } else if (auth.hasLoginProvider) {
    items.push({
      label: "Login / Register",
      icon: "mdi mdi-account",
      command: () => {
        auth.displayAuthModal();
      },
    } satisfies MenuItem);
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.add({
      severity: "success",
      summary: "Copied",
      detail: `Version ${text} copied to clipboard`,
      life: 2000,
    });
  };

  const result = [
    {
      label: "Account",
      icon: "mdi mdi-account",
      items,
    },
    {
      separator: true,
    },
    {
      label: "Versions",
      icon: "mdi mdi-information",
      items: [
        {
          label: `Agent: v${agentVersion.value}`,
          icon: "mdi mdi-robot",
          disabled: false,
          command: () => copyToClipboard(agentVersion.value),
          class: "copiable-version",
        },
        {
          label: `UI: v${uiVersion}`,
          icon: "mdi mdi-view-dashboard",
          disabled: false,
          command: () => copyToClipboard(uiVersion || "1.0.0"),
          class: "copiable-version",
        },
        {
          label: `Electron: v${electronVersion}`,
          icon: "mdi mdi-atom",
          disabled: false,
          command: () => copyToClipboard(electronVersion),
          class: "copiable-version",
        },
      ],
    },
    {
      separator: true,
    },
    {
      label: "Settings",
      icon: "mdi mdi-cog",
      disabled: false,
      command: () => {
        console.log("Settings");
        isSettingsModalVisible.value = true;
      },
    },
  ] satisfies MenuItem;

  return result;
});

handle("update:set-status", async (event, { value }) => {
  console.log("event", event);
  console.log("value", value);

  updateStatus.value = value.status;
});

const schema = toTypedSchema(
  object({
    email: pipe(
      string("An email adress is required"),
      nonEmpty("Email is required"),
      email("Invalid email"),
    ),
    password: pipe(
      string("A password is required"),
      minLength(10, "Password must be at least 10 characters long"),
      regex(/[a-z]/, "Password must contain at least one lowercase letter"),
      regex(/[A-Z]/, "Password must contain at least one uppercase letter"),
      regex(/[0-9]/, "Password must contain at least one number"),
      regex(/[!@#$%^&*()_+-=[\]{};':"|<>?,./`~.]/, "Password must contain at least one symbol"),
    ),
  }),
);

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: schema,
});

const [emailModel, emailProps] = defineField("email");
const [passwordModel, passwordProps] = defineField("password");

const onSuccess = async (values: any) => {
  try {
    if (type.value === "register") {
      const { error } = await auth.register(values.email, values.password);
      if (error) {
        console.log("error", error);
        toast.add({
          severity: "error",
          summary: "Failed to register",
          detail: error.message,
          life: 3000,
        });
      } else {
        isAuthModalVisible.value = false;
        toast.add({
          severity: "success",
          summary: "Sucessfully registered",
          detail: "A confirmation e-mail has been sent",
          life: 3000,
        });
      }
    } else if (type.value === "forgot-password") {
      const { error } = await auth.resetPassword(values.email);
      if (error) {
        console.log("error", error);
        toast.add({
          severity: "error",
          summary: "Failed to send reset email",
          detail: error.message,
          life: 3000,
        });
      } else {
        type.value = "login";
        toast.add({
          severity: "success",
          summary: "Reset email sent",
          detail: "If an account with that email exists, we've sent you a password reset link.",
          life: 5000,
        });
      }
    } else {
      const { error } = await auth.login(values.email, values.password);
      if (error) {
        console.log("error", error);
        toast.add({
          severity: "error",
          summary: "Failed to login",
          detail: error.message,
          life: 3000,
        });
      } else {
        isAuthModalVisible.value = false;
        toast.add({
          severity: "success",
          summary: "Sucessfully logged in",
          detail: "Welcome back!",
          life: 3000,
        });
      }
    }
  } catch (error) {
    console.log("error", error);
    toast.add({ severity: "info", summary: "Info", detail: error, life: 3000 });
  }
};

const toast = useToast();

function onInvalidSubmit({ values, errors, results }: any) {
  logger().info({ values }); // current form values
  logger().info({ errors }); // a map of field names and their first error message
  logger().info({ results }); // a detailed map of field names and their validation results
}

const onSubmit = handleSubmit(onSuccess, onInvalidSubmit);
</script>

<style lang="scss" scoped>
.layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  .header {
    padding: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);

    .title {
      font-size: 1.5rem;
      line-height: 2rem;
      margin-left: 12px;
    }

    .navigation {
      display: flex;
      align-items: center;

      .nav-button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        font-size: 1rem;
        color: var(--text-color);
        text-decoration: none;
        border-radius: 6px;
        transition: all 0.2s ease;
        cursor: pointer;

        .icon {
          opacity: 0.8;
        }

        .nav-text {
          font-weight: 500;
        }

        &:hover {
          background-color: var(--surface-hover);
          color: var(--primary-color);

          .icon {
            opacity: 1;
          }
        }

        &.active {
          background-color: var(--primary-color);
          color: var(--primary-color-text);

          .icon {
            opacity: 1;
          }
        }

        &.scenario-filtered {
          .nav-text {
            font-weight: 600;
          }

          .scenario-indicator {
            opacity: 0.8;
            margin-left: 4px;
          }
        }

        @media (max-width: 768px) {
          padding: 6px 12px;

          .nav-text {
            display: none;
          }

          .icon {
            margin-right: 0;
          }
        }
      }
    }

    .button {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    @media (max-width: 768px) {
      .navigation {
        order: 2;
      }

      .button {
        order: 3;
      }

      .title {
        order: 1;
        flex: 1;
        margin-left: 0;
        margin-right: 0;
        text-align: center;
      }
    }
  }

  .footer {
    height: 24px;
    background-color: #eee;
    border-top: 1px solid #ddd;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    padding: 0 8px;

    .connection-status {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;

      &.connected {
        color: #4caf50;
      }

      &.connecting {
        color: #ff9800;
      }

      &.disconnected,
      &.error {
        color: #f44336;
      }
    }
  }

  .content {
    flex: 1;
    overflow: auto;
  }
}
</style>
