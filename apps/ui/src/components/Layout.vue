<template>
  <div class="layout-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <!-- Sidebar -->
    <aside class="sidebar">
      <!-- Logo area -->
      <div class="sidebar-header">
        <div v-show="!isSidebarCollapsed" class="sidebar-logo-area">
          <img v-if="!isElectron" src="/icon.png" alt="Pipelab" class="sidebar-logo" />
          <span class="sidebar-brand">Pipelab</span>
        </div>
        <button
          v-tooltip.right="isSidebarCollapsed ? 'Expand sidebar' : undefined"
          class="sidebar-collapse-btn"
          @click="toggleSidebar"
        >
          <i class="mdi" :class="isSidebarCollapsed ? 'mdi-menu' : 'mdi-chevron-left'" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <router-link
          to="/dashboard"
          class="sidebar-nav-item"
          active-class="active"
          :class="{ active: route.name === 'Editor' }"
          v-tooltip.right="
            isSidebarCollapsed
              ? route.name === 'Editor'
                ? 'Back to Dashboard'
                : 'Dashboard'
              : undefined
          "
        >
          <i
            class="mdi nav-icon"
            :class="route.name === 'Editor' ? 'mdi-arrow-left' : 'mdi-view-dashboard-outline'"
          />
          <span v-show="!isSidebarCollapsed" class="nav-label">
            {{ route.name === "Editor" ? "Back to Dashboard" : "Dashboard" }}
          </span>
        </router-link>

        <router-link
          to="/paths"
          class="sidebar-nav-item"
          active-class="active"
          v-tooltip.right="isSidebarCollapsed ? 'Paths' : undefined"
        >
          <i class="mdi mdi-routes nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Paths</span>
        </router-link>

        <!-- [DISABLED] Connections hidden in bundled mode (was already Coming Soon).
             Re-enable: uncomment the div below. -->
        <!-- <div
          class="sidebar-nav-item disabled"
          v-tooltip.right="isSidebarCollapsed ? 'Connections (Coming Soon)' : 'Coming Soon'"
        >
          <i class="mdi mdi-link-variant nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Connections</span>
          <span v-show="!isSidebarCollapsed" class="coming-soon-badge">Soon</span>
        </div> -->

        <!-- [DISABLED] Plugins page hidden in bundled mode — plugin management UI disabled.
             Re-enable: uncomment the router-link below. Route (/plugins) and page stay intact. -->
        <!-- <router-link
          to="/plugins"
          class="sidebar-nav-item"
          active-class="active"
          v-tooltip.right="isSidebarCollapsed ? 'Plugins' : undefined"
        >
          <i class="mdi mdi-puzzle-outline nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Plugins</span>
        </router-link> -->

        <div
          class="sidebar-nav-item disabled"
          v-tooltip.right="isSidebarCollapsed ? 'Global Variables (Coming Soon)' : 'Coming Soon'"
        >
          <i class="mdi mdi-code-braces nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Variables</span>
          <span v-show="!isSidebarCollapsed" class="coming-soon-badge">Soon</span>
        </div>
      </nav>

      <!-- Spacer -->
      <div class="sidebar-spacer" />

      <!-- Status section -->
      <div class="sidebar-status">
        <!-- Connection status -->
        <div
          v-if="!isElectron"
          class="sidebar-status-item"
          :class="connectionState"
          v-tooltip.right="isSidebarCollapsed ? connectionText : undefined"
        >
          <span class="status-dot" :class="connectionState" />
          <i class="mdi nav-icon" :class="connectionIcon" />
          <span v-show="!isSidebarCollapsed" class="status-text">{{ connectionText }}</span>
        </div>

        <!-- Plugin loading -->
        <div
          v-if="pluginStatus"
          class="sidebar-status-item loading"
          v-tooltip.right="isSidebarCollapsed ? pluginStatus : undefined"
        >
          <i class="mdi mdi-loading mdi-spin nav-icon" />
          <span v-show="!isSidebarCollapsed" class="status-text">{{ pluginStatus }}</span>
        </div>

        <!-- Update available -->
        <button
          v-if="updateStatus === 'update-available' && updateDownloadUrl"
          class="sidebar-update-btn"
          @click="openLink(updateDownloadUrl)"
          v-tooltip.right="isSidebarCollapsed ? `v${updateVersion} available` : undefined"
        >
          <i class="mdi mdi-download nav-icon" />
          <span v-show="!isSidebarCollapsed" class="status-text">
            Update v{{ updateVersion }}
          </span>
        </button>
        <div
          v-else-if="updateStatusText"
          class="sidebar-status-item muted"
          v-tooltip.right="isSidebarCollapsed ? updateStatusText : undefined"
        >
          <i class="mdi mdi-update nav-icon" />
          <span v-show="!isSidebarCollapsed" class="status-text">{{ updateStatusText }}</span>
        </div>
      </div>

      <div class="sidebar-divider" />

      <!-- Bottom actions -->
      <div class="sidebar-bottom">
        <!-- Upgrade -->
        <div v-if="!isLoadingSubscriptions" class="sidebar-upgrade-wrap">
          <UpgradeNowButton @open-upgrade-dialog="openUpgradeDialog" />
        </div>

        <!-- Help & Support -->
        <button
          class="sidebar-nav-item"
          @click="toggleHelpMenu"
          v-tooltip.right="isSidebarCollapsed ? 'Help & Support' : undefined"
        >
          <i class="mdi mdi-help-circle-outline nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Help & Support</span>
        </button>
        <Menu ref="$helpMenu" :model="helpMenuItems" :popup="true">
          <template #item="{ item, props }">
            <a
              v-bind="props.action"
              class="flex justify-content-between align-items-center w-full p-2 cursor-pointer"
            >
              <div class="flex align-items-center">
                <i v-if="item.icon" :class="[item.icon, 'mr-2']"></i>
                <span>{{ item.label }}</span>
              </div>
            </a>
          </template>
        </Menu>

        <!-- Settings -->
        <button
          class="sidebar-nav-item"
          v-tooltip.right="isSidebarCollapsed ? 'Settings' : undefined"
          @click="isSettingsModalVisible = true"
        >
          <i class="mdi mdi-cog-outline nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Settings</span>
        </button>

        <div v-if="user" class="sidebar-divider" />

        <!-- Account Bottom Row -->
        <div v-if="user" class="sidebar-account-row">
          <div v-show="!isSidebarCollapsed" class="account-left">
            <i class="mdi mdi-account nav-icon" />
            <span class="account-email truncate font-semibold">{{ user.email }}</span>
          </div>
          <button
            class="account-logout-btn"
            :class="{ 'collapsed-logout': isSidebarCollapsed }"
            v-tooltip.right="isSidebarCollapsed ? 'Logout' : undefined"
            v-tooltip.top="!isSidebarCollapsed ? 'Logout' : undefined"
            @click="logout"
          >
            <i class="mdi mdi-logout" />
          </button>
        </div>

        <!-- Login / Register (if not logged in) -->
        <button
          v-if="!user && auth.hasLoginProvider"
          class="sidebar-nav-item login-btn"
          v-tooltip.right="isSidebarCollapsed ? 'Login / Register' : undefined"
          @click="auth.displayAuthModal()"
        >
          <i class="mdi mdi-login nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Login / Register</span>
        </button>
      </div>
    </aside>

    <!-- Main content area -->
    <div class="layout-main">
      <main class="layout-content">
        <slot></slot>
      </main>
    </div>

    <!-- Auth Dialog (Login / Register / Forgot Password) -->
    <AuthDialog />

    <!-- Settings Dialog -->
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
import { ref, computed, inject, watch } from "vue";
import { useAuth } from "@renderer/store/auth";
import { OpenUpgradeDialogKey } from "../utils/injection-keys";
import { useShell } from "@renderer/composables/use-shell";
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
import AuthDialog from "@renderer/components/AuthDialog.vue";
import Menu from "primevue/menu";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { UpdateStatus } from "@pipelab/shared";
import posthog from "posthog-js";
import { storeToRefs } from "pinia";
import { handle } from "@renderer/composables/handlers";
import { useRoute } from "vue-router";
import { websocketManager } from "@renderer/composables/websocket-manager";

const { logger } = useLogger();
const route = useRoute();
const shell = useShell();

const isElectron = !!window.electron;

const openUpgradeDialog = inject(OpenUpgradeDialogKey) as () => void;

const $helpMenu = ref();

// Sidebar state
const isSidebarCollapsed = ref(false);
const userSidebarPreference = ref(false); // tracks manual preference

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
  userSidebarPreference.value = isSidebarCollapsed.value;
};

// Auto-collapse on editor route
watch(
  () => route.name,
  (routeName) => {
    if (routeName === "Editor") {
      isSidebarCollapsed.value = true;
    } else {
      isSidebarCollapsed.value = userSidebarPreference.value;
    }
  },
  { immediate: true },
);

const updateStatus = ref<UpdateStatus>("update-not-available");
const updateDownloadUrl = ref<string | undefined>(undefined);
const updateVersion = ref<string | undefined>(undefined);

const appVersion = ref(window.version);
const agentVersion = ref("...");
const uiVersion = process.env.UI_VERSION;
const electronVersion = window.pipelab?.versions?.electron || "N/A";

const pluginStatus = ref("");

import { useWebSocketAPI } from "@renderer/composables/websocket-client";
const { on } = useWebSocketAPI();

on("startup:progress", (event: any) => {
  if (event.type === "progress") {
    pluginStatus.value = event.data.message;
  } else if (event.type === "ready" || event.type === "done") {
    setTimeout(() => {
      pluginStatus.value = "";
    }, 2000);
  }
});

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

const toggleHelpMenu = (event: MouseEvent) => {
  $helpMenu.value.toggle(event);
};

const helpMenuItems = computed(() => [
  {
    label: "Documentation",
    icon: "mdi mdi-book-open-page-variant-outline",
    command: () => {
      openLink("https://docs.pipelab.app");
    },
  },
  {
    label: "Community Discord",
    icon: "pi pi-discord",
    command: () => {
      openLink("https://discord.gg/your-invite-code");
    },
  },
  {
    label: "Report an Issue",
    icon: "mdi mdi-github",
    command: () => {
      openLink("https://github.com/CynToolkit/pipelab/issues/new");
    },
  },
]);

const openLink = (url: string) => {
  shell.openExternal(url);
  posthog.capture("social_link_clicked", { url });
};

const logout = async () => {
  await auth.logout();
};

const auth = useAuth();
const { user, isLoadingSubscriptions } = storeToRefs(auth);

const isSettingsModalVisible = ref(false);

handle("update:set-status", async (event, { value }) => {
  console.log("event", event);
  console.log("value", value);

  updateStatus.value = value.status;
  updateDownloadUrl.value = value.downloadUrl;
  updateVersion.value = value.version;
});
</script>

<style lang="scss" scoped>
/* ─── Layout Shell ──────────────────────────────────────── */
.layout-shell {
  height: 100%;
  width: 100%;
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

/* ─── Sidebar ───────────────────────────────────────────── */
.sidebar {
  width: 240px;
  min-width: 240px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-50);
  border-right: 1px solid var(--p-surface-200);
  transition:
    width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  z-index: 100;

  :root.dark & {
    background: var(--p-surface-900);
    border-right-color: var(--p-surface-700);
  }
}

.sidebar-collapsed .sidebar {
  width: 64px;
  min-width: 64px;
}

/* ─── Sidebar Header ────────────────────────────────────── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 12px;
  gap: 8px;
  min-height: 56px;
}

.sidebar-logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  min-width: 0;
}

.sidebar-logo {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}

.sidebar-brand {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--p-text-color);
  white-space: nowrap;
}

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--p-surface-200);
    color: var(--p-text-color);

    :root.dark & {
      background: var(--p-surface-700);
    }
  }

  i {
    font-size: 18px;
  }
}

.sidebar-collapsed .sidebar-header {
  justify-content: center;
}

.sidebar-collapsed .sidebar-collapse-btn {
  margin: 0 auto;
}

/* ─── Sidebar Navigation ───────────────────────────────── */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.825rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  text-decoration: none;
  cursor: pointer;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;

  &:hover {
    background: var(--p-surface-200);
    color: var(--p-text-color);

    :root.dark & {
      background: var(--p-surface-700);
    }
  }

  &.disabled {
    opacity: 0.55;
    cursor: not-allowed;

    &:hover {
      background: transparent;
      color: var(--p-text-muted-color);
    }
  }

  &.active {
    background: var(--p-surface-200);
    color: var(--p-text-color);
    font-weight: 600;

    :root.dark & {
      background: var(--p-surface-700);
    }
  }

  .nav-icon {
    font-size: 18px;
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }

  .nav-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .coming-soon-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--p-surface-200);
    color: var(--p-text-muted-color);
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: auto;

    :root.dark & {
      background: var(--p-surface-800);
    }
  }
}

.sidebar-collapsed .sidebar-nav-item {
  justify-content: center;
  padding: 10px;

  .nav-label {
    display: none;
  }
}

/* ─── Sidebar Spacer ────────────────────────────────────── */
.sidebar-spacer {
  flex: 1;
}

/* ─── Sidebar Status ────────────────────────────────────── */
.sidebar-status {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.sidebar-status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;

  .nav-icon {
    font-size: 16px;
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }

  &.connected {
    .nav-icon,
    .status-dot {
      color: #22c55e;
    }
  }
  &.connecting {
    .nav-icon,
    .status-dot {
      color: #f59e0b;
    }
  }
  &.disconnected,
  &.error {
    .nav-icon,
    .status-dot {
      color: #ef4444;
    }
  }

  .status-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.sidebar-collapsed .sidebar-status-item {
  justify-content: center;
  padding: 8px;

  .status-text,
  .status-dot {
    display: none;
  }
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: none; /* shown only in expanded mode as an accent */
}

.sidebar-update-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.8rem;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #6366f1;
  cursor: pointer;
  width: 100%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(99, 102, 241, 0.15);
  }

  .nav-icon {
    font-size: 16px;
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }
}

.sidebar-collapsed .sidebar-update-btn {
  justify-content: center;
  padding: 8px;

  .status-text {
    display: none;
  }
}

/* ─── Sidebar Divider ───────────────────────────────────── */
.sidebar-divider {
  height: 1px;
  margin: 8px 12px;
  background: var(--p-surface-200);

  :root.dark & {
    background: var(--p-surface-700);
  }
}

/* ─── Sidebar Bottom ────────────────────────────────────── */
.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px 12px;
}

.sidebar-upgrade-wrap {
  padding: 4px 2px;

  :deep(.upgrade-now-button) {
    width: 100%;
    justify-content: center;
    padding: 8px 12px;
    font-size: 0.8rem;
  }
}

.sidebar-collapsed .sidebar-upgrade-wrap {
  :deep(.upgrade-now-button) {
    padding: 8px;
    font-size: 0;
    gap: 0;

    .upgrade-icon {
      font-size: 18px;
      margin-right: 0;
    }
  }
}

/* ─── Account Section ───────────────────────────────────── */
.sidebar-account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 8px;
  margin-top: 4px;
  background: var(--p-surface-100);
  min-width: 0;
  gap: 16px;

  :root.dark & {
    background: var(--p-surface-850);
  }
}

.sidebar-collapsed .sidebar-account-row {
  background: transparent;
  padding: 0;
  margin-top: 0;
  justify-content: center;
  width: 100%;
}

.account-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;

  .nav-icon {
    font-size: 18px;
    color: var(--p-text-muted-color);
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }

  .account-email {
    font-size: 0.775rem;
    font-weight: 600;
    color: var(--p-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.account-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  i {
    font-size: 16px;
  }

  &:hover {
    background: rgba(239, 68, 68, 0.08);
    color: var(--p-red-500, #ef4444);
  }

  &.collapsed-logout {
    width: 100%;
    height: 36px;
    border-radius: 8px;
    padding: 10px;

    i {
      font-size: 18px;
    }

    &:hover {
      background: var(--p-surface-200);
      color: var(--p-text-color);

      :root.dark & {
        background: var(--p-surface-700);
      }
    }
  }
}

/* ─── Main Content ──────────────────────────────────────── */
.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.layout-content {
  flex: 1;
  overflow: auto;
}

/* ─── Mobile: bottom tab bar ─────────────────────────────── */
@media (max-width: 768px) {
  .layout-shell {
    flex-direction: column;
  }

  .sidebar,
  .sidebar-collapsed .sidebar {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: calc(60px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    flex-direction: row;
    align-items: center;
    order: 2;
    border-right: none;
    border-top: 1px solid var(--p-surface-200);
    overflow-x: auto;
    overflow-y: hidden;

    :root.dark & {
      border-top-color: var(--p-surface-700);
    }
  }

  .sidebar-header,
  .sidebar-spacer,
  .sidebar-status,
  .sidebar-divider,
  .sidebar-upgrade-wrap,
  .sidebar-nav-item.disabled,
  .sidebar-nav-item .nav-label,
  .sidebar-nav-item .coming-soon-badge,
  .sidebar-account-row .account-left,
  .sidebar-bottom .sidebar-divider {
    display: none !important;
  }

  .sidebar-nav,
  .sidebar-bottom {
    flex-direction: row;
    align-items: center;
    padding: 0 4px;
    gap: 0;
  }

  .sidebar-nav {
    flex: 1;
    justify-content: space-around;
  }

  .sidebar-nav-item,
  .sidebar-collapsed .sidebar-nav-item {
    flex: 1;
    justify-content: center;
    padding: 8px 4px;
    min-width: 56px;
    min-height: 44px;

    .nav-icon {
      font-size: 22px;
      width: auto;
    }
  }

  .sidebar-bottom {
    padding: 0 4px;
  }

  .sidebar-account-row {
    background: transparent;
    padding: 0;
    margin: 0;
  }

  .account-logout-btn,
  .account-logout-btn.collapsed-logout {
    width: 44px;
    height: 44px;
    padding: 8px;
  }

  .layout-main {
    order: 1;
    padding-bottom: 0;
    min-height: 0;
  }
}
</style>
