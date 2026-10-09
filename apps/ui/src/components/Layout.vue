<template>
  <div class="layout-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <!-- Sidebar -->
    <aside id="app-sidebar" class="sidebar">
      <!-- Logo area -->
      <div class="sidebar-header">
        <div v-show="!isSidebarCollapsed" class="sidebar-logo-area">
          <img v-if="!isElectron" src="/icon.png" alt="Pipelab" class="sidebar-logo" />
          <span class="sidebar-brand">Pipelab</span>
        </div>
        <button
          v-tooltip.right="isSidebarCollapsed ? $t('home.expand-sidebar') : undefined"
          class="sidebar-collapse-btn"
          :aria-label="isSidebarCollapsed ? $t('home.expand-sidebar') : $t('home.collapse-sidebar')"
          :aria-expanded="!isSidebarCollapsed"
          aria-controls="app-sidebar"
          @click="toggleSidebar"
        >
          <i class="mdi" :class="isSidebarCollapsed ? 'mdi-menu' : 'mdi-chevron-left'" />
        </button>
      </div>

      <!-- Project context stays available across every route. -->
      <section class="sidebar-project" :aria-label="$t('home.project')">
        <label
          v-show="!isSidebarCollapsed"
          for="sidebar-project-select-input"
          class="project-label"
        >
          {{ $t("home.project") }}
        </label>
        <div class="project-controls">
          <Select
            id="sidebar-project-select"
            inputId="sidebar-project-select-input"
            :model-value="selectedProjectId"
            :options="projects"
            option-label="name"
            option-value="id"
            :placeholder="$t('home.choose-project')"
            :aria-label="
              activeProject
                ? $t('home.select-project-named', { name: activeProject.name })
                : $t('home.select-project')
            "
            :disabled="!filesReady || projects.length === 0"
            :title="activeProject?.name || $t('home.choose-project')"
            class="sidebar-project-select"
            @update:model-value="selectProject"
          >
            <template #value="slotProps">
              <span v-if="activeProject" class="project-select-value">
                <span v-if="isSidebarCollapsed" class="project-initial" aria-hidden="true">
                  {{ activeProject.name.slice(0, 1).toUpperCase() }}
                </span>
                <span v-else>{{ activeProject.name }}</span>
              </span>
              <span v-else>{{ slotProps.placeholder }}</span>
            </template>
          </Select>
          <Button
            icon="mdi mdi-dots-horizontal"
            text
            rounded
            severity="secondary"
            type="button"
            :aria-label="$t('home.project-actions')"
            aria-haspopup="menu"
            aria-controls="sidebar-project-menu"
            :aria-expanded="isProjectMenuOpen"
            :disabled="!filesReady || !isReady"
            v-tooltip.right="isSidebarCollapsed ? $t('home.project-actions') : undefined"
            @click="toggleProjectMenu"
          />
        </div>
        <small v-if="!filesReady && fileStore.status === 'error'" class="project-load-error">
          {{ $t("home.projects-unavailable") }}
          <button type="button" @click="loadProjects">{{ $t("home.retry") }}</button>
        </small>
        <Menu
          id="sidebar-project-menu"
          ref="$projectMenu"
          :model="projectMenuItems"
          :popup="true"
          @show="isProjectMenuOpen = true"
          @hide="isProjectMenuOpen = false"
        />
      </section>

      <!-- Navigation -->
      <nav id="sidebar-nav" class="sidebar-nav" :aria-label="$t('home.main-navigation')">
        <router-link
          to="/dashboard"
          class="sidebar-nav-item"
          :aria-label="$t('headers.dashboard')"
          :class="{ active: route.path === '/dashboard' }"
          :aria-current="route.path === '/dashboard' ? 'page' : undefined"
          v-tooltip.right="isSidebarCollapsed ? $t('headers.dashboard') : undefined"
        >
          <i class="mdi mdi-view-dashboard-outline nav-icon" aria-hidden="true" />
          <span v-show="!isSidebarCollapsed" class="nav-label">{{ $t("headers.dashboard") }}</span>
        </router-link>

        <router-link
          to="/workflows"
          class="sidebar-nav-item"
          :aria-label="$t('home.workflows')"
          :class="{ active: isWorkflowsRoute }"
          :aria-current="isWorkflowsRoute ? 'page' : undefined"
          v-tooltip.right="isSidebarCollapsed ? $t('home.workflows') : undefined"
        >
          <i class="mdi mdi-rocket-launch-outline nav-icon" aria-hidden="true" />
          <span v-show="!isSidebarCollapsed" class="nav-label">{{ $t("home.workflows") }}</span>
        </router-link>

        <router-link
          to="/connections"
          class="sidebar-nav-item"
          :aria-label="$t('home.connections')"
          :class="{ active: route.path === '/connections' }"
          :aria-current="route.path === '/connections' ? 'page' : undefined"
          v-tooltip.right="isSidebarCollapsed ? $t('home.connections') : undefined"
        >
          <i class="mdi mdi-link-variant nav-icon" aria-hidden="true" />
          <span v-show="!isSidebarCollapsed" class="nav-label">{{ $t("home.connections") }}</span>
        </router-link>

        <div
          class="sidebar-nav-item disabled"
          v-tooltip.right="
            isSidebarCollapsed ? $t('home.global-variables-coming-soon') : $t('home.coming-soon')
          "
        >
          <i class="mdi mdi-code-braces nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">{{ $t("home.variables") }}</span>
          <span v-show="!isSidebarCollapsed" class="coming-soon-badge">{{
            $t("home.coming-soon")
          }}</span>
        </div>
      </nav>

      <!-- Spacer -->
      <div class="sidebar-spacer" />

      <!-- Status section -->
      <div class="sidebar-status">
        <!-- Connection status -->
        <div
          v-if="!isElectron || !isReady"
          class="sidebar-status-item"
          :class="connectionState"
          v-tooltip.right="isSidebarCollapsed ? connectionText : undefined"
        >
          <span class="status-dot" :class="connectionState" />
          <i class="mdi nav-icon" :class="connectionIcon" />
          <span v-show="!isSidebarCollapsed" class="status-text">{{ connectionText }}</span>
        </div>

        <!-- Host startup progress -->
        <div
          v-if="startupStatus"
          class="sidebar-status-item loading"
          v-tooltip.right="isSidebarCollapsed ? startupStatus : undefined"
        >
          <i class="mdi mdi-loading mdi-spin nav-icon" />
          <span v-show="!isSidebarCollapsed" class="status-text">{{ startupStatus }}</span>
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
        <div v-if="isReady && subscriptionStatus === 'ready'" class="sidebar-upgrade-wrap">
          <UpgradeNowButton @open-upgrade-dialog="openUpgradeDialog" />
        </div>
        <div v-else-if="isReady && user && subscriptionStatus !== 'ready'">
          <div
            class="sidebar-status-item muted"
            role="status"
            :title="subscriptionError || undefined"
          >
            <i class="mdi mdi-crown nav-icon" />
            <span v-show="!isSidebarCollapsed">{{
              subscriptionStatus === "error" ? "Plan unavailable" : "Checking plan…"
            }}</span>
          </div>
          <div v-if="subscriptionStatus === 'error' && !isSidebarCollapsed" class="plan-retry-wrap">
            <button
              class="plan-retry"
              type="button"
              :disabled="isLoadingSubscriptions"
              @click="retrySubscription"
            >
              Retry plan check
            </button>
          </div>
          <details v-if="subscriptionError && !isSidebarCollapsed" class="plan-error-details">
            <summary>Show lookup error</summary>
            <p>{{ subscriptionError }}</p>
          </details>
        </div>

        <!-- Help & Support -->
        <button
          class="sidebar-nav-item"
          aria-label="Help & Support"
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
          aria-label="Settings"
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
            :disabled="!isReady"
            :title="isReady ? undefined : 'Reconnect the agent to sign out.'"
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
          :disabled="!isReady || auth.authState === 'INITIALIZING' || auth.authState === 'LOADING'"
          :title="isReady ? undefined : 'Connect an agent to sign in.'"
        >
          <i class="mdi mdi-login nav-icon" />
          <span v-show="!isSidebarCollapsed" class="nav-label">Login / Register</span>
        </button>
        <p
          v-if="isBrowser && !user && !auth.hasLoginProvider && !isSidebarCollapsed"
          class="hosted-account-note"
        >
          {{ $t("home.browser-sign-in-agent-required") }}
        </p>
        <button
          v-if="isBrowser && !user && !auth.hasLoginProvider"
          type="button"
          class="hosted-account-note-trigger"
          :class="{ 'desktop-collapsed-note': isSidebarCollapsed }"
          :aria-label="$t('home.browser-sign-in-agent-required')"
          v-tooltip.right="$t('home.browser-sign-in-agent-required')"
        >
          <i class="mdi mdi-information-outline" aria-hidden="true" />
        </button>
      </div>
    </aside>

    <!-- Main content area -->
    <div class="layout-main">
      <div v-if="!isReady" class="agent-notice" role="status" aria-live="polite">
        <span>{{ agentNotice }}</span>
        <Button
          v-if="!isBrowser && agentStatus === 'offline'"
          label="Reconnect"
          text
          size="small"
          @click="reconnect"
        />
      </div>
      <div class="layout-content">
        <div class="route-content">
          <slot></slot>
        </div>
      </div>
    </div>

    <!-- Auth Dialog (Login / Register / Forgot Password) -->
    <AuthDialog v-if="hasOpenedAuthDialog" />

    <ConfirmDialog />

    <Dialog
      v-model:visible="isNewProjectModalVisible"
      modal
      :header="$t('home.new-project')"
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <div class="project-dialog-content">
        <label for="sidebar-new-project-name">{{ $t("home.project-name") }}</label>
        <InputText
          id="sidebar-new-project-name"
          v-model="newProjectName"
          class="w-full"
          :disabled="isSavingProject"
        />
      </div>
      <template #footer>
        <Button
          :label="$t('base.cancel')"
          text
          severity="secondary"
          :disabled="isSavingProject"
          @click="isNewProjectModalVisible = false"
        />
        <Button
          :label="$t('home.create-project')"
          :disabled="!canCreateProject || isSavingProject"
          :loading="isSavingProject"
          @click="createProject"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="isRenameProjectModalVisible"
      modal
      :header="$t('home.rename-project')"
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <div class="project-dialog-content">
        <label for="sidebar-rename-project-name">{{ $t("home.new-project-name") }}</label>
        <InputText
          id="sidebar-rename-project-name"
          v-model="renameProjectName"
          class="w-full"
          :disabled="isSavingProject"
        />
      </div>
      <template #footer>
        <Button
          :label="$t('base.cancel')"
          text
          severity="secondary"
          :disabled="isSavingProject"
          @click="isRenameProjectModalVisible = false"
        />
        <Button
          :label="$t('home.rename-project')"
          :disabled="!renameProjectName.trim() || isSavingProject"
          :loading="isSavingProject"
          @click="renameProject"
        />
      </template>
    </Dialog>

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

      <Settings v-if="isSettingsModalVisible"></Settings>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onUnmounted, defineAsyncComponent } from "vue";
import { useAuth } from "@renderer/store/auth";
import { OpenUpgradeDialogKey } from "../utils/injection-keys";
import { useShell } from "@renderer/composables/use-shell";
import { uiEnvironment } from "@renderer/composables/ui-runtime";
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
import UpgradeNowButton from "@renderer/components/UpgradeNowButton.vue";
import Menu from "primevue/menu";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Select from "primevue/select";
import InputText from "primevue/inputtext";
import ConfirmDialog from "primevue/confirmdialog";
import { useFiles } from "@renderer/store/files";
import { storeToRefs } from "pinia";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { nanoid } from "nanoid";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { UpdateStatus } from "@pipelab/shared";
import posthog from "posthog-js";
import { handle } from "@renderer/composables/handlers";
import { websocketManager } from "@renderer/composables/websocket-manager";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { useAppStore } from "@renderer/store/app";

const Settings = defineAsyncComponent(() => import("@renderer/components/Settings.vue"));
const AuthDialog = defineAsyncComponent(() => import("@renderer/components/AuthDialog.vue"));

const { logger } = useLogger();
const shell = useShell();
const { isReady, status: agentStatus, reconnect } = useAgentAvailability();
const isBrowser = uiEnvironment === "browser";
const appStore = useAppStore();
const fileStore = useFiles();
const authStore = useAuth();
const toast = useToast();
const confirm = useConfirm();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const { hasMultipleProjectsBenefit } = storeToRefs(authStore);
const { files } = storeToRefs(fileStore);
const projects = computed(() => files.value.projects);
const filesReady = computed(() => fileStore.status === "ready");
const selectedProjectId = computed(() => fileStore.selectedProjectId);
const activeProject = computed(() =>
  projects.value.find((project) => project.id === selectedProjectId.value),
);
const isWorkflowsRoute = computed(
  () => route.path === "/workflows" || route.path.startsWith("/workflows/"),
);
const isProjectMenuOpen = ref(false);
const $projectMenu = ref();
const isNewProjectModalVisible = ref(false);
const isRenameProjectModalVisible = ref(false);
const isSavingProject = ref(false);
const newProjectName = ref("");
const renameProjectName = ref("");
const canCreateProject = computed(
  () => newProjectName.value.trim().length > 0 && authStore.subscriptionStatus === "ready",
);
const agentNotice = computed(() => {
  if (agentStatus.value === "offline")
    return "No agent connected. Your data and actions will be available when it reconnects.";
  if (agentStatus.value === "starting")
    return "The agent is starting. Data will appear as it becomes available.";
  return "Connecting to the agent…";
});

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

const updateStatus = ref<UpdateStatus>("update-not-available");
const updateDownloadUrl = ref<string | undefined>(undefined);
const updateVersion = ref<string | undefined>(undefined);

const appVersion = ref(window.version);
const agentVersion = computed(() => appStore.version || "...");
const uiVersion = process.env.UI_VERSION;
const electronVersion = window.pipelab?.versions?.electron || "N/A";

const startupStatus = ref("");
const loadProjects = async () => {
  if (!isReady.value) return;
  try {
    await fileStore.load(true);
  } catch {
    // The dashboard presents the persisted project load error and retry action.
  }
};

import { useWebSocketAPI } from "@renderer/composables/websocket-client";
const { on } = useWebSocketAPI();

const stopStartupProgress = on("startup:progress", (event) => {
  if (event.type === "progress") {
    startupStatus.value = event.data.message;
  } else if (event.type === "done") {
    startupStatus.value = "";
  }
});
onUnmounted(stopStartupProgress);

watch(
  isReady,
  (ready) => {
    if (ready) {
      void appStore.loadRuntimeInfo().catch(() => {});
      void loadProjects();
    } else startupStatus.value = "";
  },
  { immediate: true },
);

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
const { user, subscriptionStatus, subscriptionError, isLoadingSubscriptions, isAuthModalVisible } =
  storeToRefs(auth);
const hasOpenedAuthDialog = ref(isAuthModalVisible.value);
watch(isAuthModalVisible, (visible) => {
  if (visible) hasOpenedAuthDialog.value = true;
});

const retrySubscription = () => {
  if (isReady.value) void auth.fetchSubscription();
};

watch(
  [projects, selectedProjectId, () => route.params.projectId, filesReady],
  ([availableProjects, selectedId, routeProjectId, ready]) => {
    if (!ready) return;
    const routeId = typeof routeProjectId === "string" ? routeProjectId : undefined;
    const routeProject = routeId && availableProjects.some((project) => project.id === routeId);
    const nextId = routeProject
      ? routeId
      : selectedId && availableProjects.some((project) => project.id === selectedId)
        ? selectedId
        : availableProjects[0]?.id;
    if (nextId !== selectedId) fileStore.selectProject(nextId);
  },
  { immediate: true },
);

const selectProject = async (projectId: string | undefined) => {
  if (!projectId || projectId === selectedProjectId.value) return;
  if (route.params.projectId && route.params.projectId !== projectId) {
    await router.push("/workflows");
  }
  fileStore.selectProject(projectId);
};

const projectMenuItems = computed(() => [
  {
    label: t("home.new-project"),
    icon: "mdi mdi-plus",
    disabled: !filesReady.value || !isReady.value || authStore.subscriptionStatus !== "ready",
    command: () => {
      if (authStore.subscriptionStatus !== "ready" || !filesReady.value || !isReady.value) return;
      if (hasMultipleProjectsBenefit.value) isNewProjectModalVisible.value = true;
      else openUpgradeDialog();
    },
  },
  {
    label: t("home.rename-project"),
    icon: "mdi mdi-pencil",
    disabled: !filesReady.value || !isReady.value || !activeProject.value,
    command: () => {
      if (!activeProject.value) return;
      renameProjectName.value = activeProject.value.name;
      isRenameProjectModalVisible.value = true;
    },
  },
  { separator: true },
  {
    label: t("home.delete-project"),
    icon: "mdi mdi-delete",
    class: "text-red-500",
    disabled: !filesReady.value || !isReady.value || projects.value.length <= 1,
    command: deleteActiveProject,
  },
]);

const toggleProjectMenu = (event: Event) => $projectMenu.value?.toggle(event);

const createProject = async () => {
  if (!canCreateProject.value || !isReady.value || !filesReady.value) return;
  isSavingProject.value = true;
  const projectId = nanoid();
  const projectName = newProjectName.value.trim();
  try {
    await fileStore.update((state) => {
      state.projects.push({ id: projectId, name: projectName, description: "" });
    });
    isNewProjectModalVisible.value = false;
    newProjectName.value = "";
    if (route.params.projectId) await router.push("/workflows");
    fileStore.selectProject(projectId);
  } catch (error) {
    toast.add({ severity: "error", summary: t("base.error"), detail: String(error), life: 5000 });
  } finally {
    isSavingProject.value = false;
  }
};

const renameProject = async () => {
  if (
    !activeProject.value ||
    !renameProjectName.value.trim() ||
    !isReady.value ||
    !filesReady.value
  )
    return;
  isSavingProject.value = true;
  const projectId = activeProject.value.id;
  const name = renameProjectName.value.trim();
  try {
    await fileStore.update((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (project) project.name = name;
    });
    isRenameProjectModalVisible.value = false;
  } catch (error) {
    toast.add({ severity: "error", summary: t("base.error"), detail: String(error), life: 5000 });
  } finally {
    isSavingProject.value = false;
  }
};

const deleteActiveProject = () => {
  const project = activeProject.value;
  if (!project || !isReady.value || !filesReady.value || projects.value.length <= 1) return;
  const hasWorkflows = files.value.workflows?.some((workflow) => workflow.project === project.id);
  if (hasWorkflows) {
    toast.add({
      severity: "error",
      summary: t("home.cannot-delete-project"),
      detail: t("home.project-not-empty"),
      life: 5000,
    });
    return;
  }
  confirm.require({
    message: t("home.confirm-delete-project"),
    header: t("home.delete-project"),
    icon: "pi pi-exclamation-triangle",
    rejectClass: "p-button-secondary p-button-outlined",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await fileStore.removeProject(project.id);
      } catch (error) {
        toast.add({
          severity: "error",
          summary: t("base.error"),
          detail: String(error),
          life: 5000,
        });
      }
    },
  });
};

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

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
    outline-offset: 2px;
  }

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

.sidebar-project {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 12px 12px;
  border-bottom: 1px solid var(--p-surface-200);

  :root.dark & {
    border-bottom-color: var(--p-surface-700);
  }
}

.project-label {
  color: var(--p-text-muted-color);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.project-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;

  :deep(.p-button) {
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
  }

  :deep(.p-button:focus-visible),
  :deep(.p-select:focus-visible) {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
  }

  :deep(.p-select-label:focus-visible) {
    position: relative;
    z-index: 1;
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
    border-radius: 6px;
  }
}

:global(#sidebar-project-select:has(.p-select-label:focus-visible)) {
  outline-color: var(--primary-color) !important;
  outline-style: solid !important;
  outline-width: 3px !important;
  outline-offset: 2px !important;
  border-radius: 6px;
}

.sidebar-project-select {
  flex: 1;
  width: 0;
  min-width: 0;
  min-height: 36px;

  :deep(.p-select-label) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.project-select-value {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-initial {
  display: block;
  text-align: center;
  font-weight: 700;
}

.project-load-error {
  color: var(--p-red-500, #ef4444);
  font-size: 0.68rem;

  button {
    margin-left: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
}

.project-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-collapsed .sidebar-project {
  align-items: center;
  padding: 8px 10px;
}

.sidebar-collapsed .project-controls {
  flex-direction: column;
  gap: 6px;

  :deep(.p-button) {
    flex-basis: 36px;
  }
}

.sidebar-collapsed .sidebar-project-select {
  flex: 0 0 40px;
  width: 40px;
  height: 36px;

  :deep(.p-select-label) {
    padding: 0.5rem 0.25rem;
  }

  :deep(.p-select-dropdown) {
    width: 0.75rem;
  }
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

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
    outline-offset: 2px;
  }

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
  &.hosted {
    .nav-icon {
      color: var(--p-text-muted-color);
    }
  }

  .status-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.plan-retry-wrap {
  margin: 0 12px 4px 38px;
}

.plan-retry {
  border: 0;
  padding: 2px 4px;
  background: transparent;
  color: var(--p-primary-color);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}

.plan-error-details {
  margin: 0 12px 6px 38px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;

  summary {
    cursor: pointer;
  }

  p {
    margin: 4px 0 0;
    overflow-wrap: anywhere;
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

.hosted-account-note {
  margin: 0.25rem 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
}

.hosted-account-note-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 4px auto;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: help;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
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
  min-height: 0;
  overflow: auto;
}

.route-content {
  height: 100%;
}

.agent-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: var(--p-surface-100);
  border-bottom: 1px solid var(--p-content-border-color);
  font-size: 0.875rem;
}

:root.dark .agent-notice {
  background: var(--p-surface-800);
}

/* ─── Mobile: bottom tab bar ─────────────────────────────── */
@media (max-width: 768px) {
  .layout-shell {
    flex-direction: column;
  }

  .sidebar,
  .sidebar-collapsed .sidebar {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(112px, 2fr);
    grid-template-rows: auto 44px;
    width: 100%;
    flex: 0 0 auto;
    min-width: 0;
    height: auto;
    min-height: calc(102px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    align-items: stretch;
    order: 2;
    border-right: none;
    border-top: 1px solid var(--p-surface-200);
    overflow: visible;

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
    min-width: 0;
  }

  .sidebar-nav {
    grid-column: 1;
    grid-row: 2;
    justify-content: space-around;
  }

  .sidebar-bottom {
    grid-column: 2;
    grid-row: 2;
    justify-content: space-around;
    padding-bottom: 0;
  }

  .sidebar-project,
  .sidebar-collapsed .sidebar-project {
    box-sizing: border-box;
    flex: 0 0 auto;
    grid-column: 1 / -1;
    grid-row: 1;
    width: 100%;
    max-width: none;
    padding: 6px 12px 8px;
    border: 0;
  }

  .sidebar-project .project-label {
    display: none !important;
  }

  .sidebar-project-select,
  .sidebar-collapsed .sidebar-project-select {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    height: auto;

    :deep(.p-select-label) {
      overflow: visible;
      overflow-wrap: anywhere;
      text-overflow: clip;
      white-space: normal;
      line-height: 1.25;
    }
  }

  .sidebar-project .project-controls,
  .sidebar-collapsed .sidebar-project .project-controls {
    flex-direction: row;
    gap: 2px;
  }

  .sidebar-project .project-controls :deep(.p-button),
  .sidebar-collapsed .sidebar-project .project-controls :deep(.p-button) {
    box-sizing: border-box;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
  }

  .project-initial {
    text-align: center;
  }

  .project-select-value {
    overflow: visible;
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }

  .hosted-account-note-trigger {
    flex: 0 0 36px;
    width: 36px;
    margin: 0 4px;
    display: flex !important;
  }

  .sidebar-nav-item,
  .sidebar-collapsed .sidebar-nav-item {
    flex: 1;
    justify-content: center;
    padding: 8px 4px;
    min-width: 40px;
    min-height: 44px;

    .nav-icon {
      font-size: 22px;
      width: auto;
    }
  }

  .sidebar-bottom {
    padding: 0 1px;
  }

  .sidebar-bottom > div:not(.sidebar-account-row) {
    display: none !important;
  }

  .hosted-account-note {
    display: none !important;
  }

  .hosted-account-note-trigger {
    box-sizing: border-box;
    flex: 0 0 36px;
    width: 36px;
    margin: 0 4px;
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

@media (min-width: 769px) {
  .hosted-account-note-trigger:not(.desktop-collapsed-note) {
    display: none;
  }
}

@media (max-width: 440px) {
  .sidebar-nav-item,
  .sidebar-collapsed .sidebar-nav-item {
    min-width: 40px;
    padding-inline: 2px;
  }

  .sidebar-bottom .sidebar-nav-item {
    min-width: 44px;
    padding: 8px 2px;
  }

  .hosted-account-note-trigger {
    margin: 0;
  }
}
</style>
