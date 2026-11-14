<template>
  <div class="workflow-shell pl-workflow">
    <header class="workflow-header">
      <nav class="workflow-breadcrumb" aria-label="Breadcrumb">
        <RouterLink to="/workflows" class="workflow-back">
          <i class="mdi mdi-arrow-left" aria-hidden="true" />{{ $t("home.workflows") }}
        </RouterLink>
      </nav>
      <div class="workflow-titlebar">
        <div class="workflow-identity">
          <div class="workflow-icon"><i class="mdi mdi-rocket-launch-outline" /></div>
          <div class="workflow-heading">
            <h1 v-if="title">{{ title }}</h1>
            <h1 v-else class="title-skeleton" aria-label="Loading workflow" />
          </div>
          <RouterLink
            v-if="planIssueCount"
            :to="`${basePath}/plan`"
            class="issue-chip"
            v-tooltip.bottom="'Open the plan'"
          >
            <i class="pi pi-exclamation-triangle" aria-hidden="true" />
            {{ planIssueCount }} {{ planIssueCount === 1 ? "issue" : "issues" }}
          </RouterLink>
        </div>
        <div ref="actionsEl" class="workflow-actions" />
      </div>
    </header>

    <div class="workflow-nav-bar">
      <nav ref="nav" class="workflow-nav" aria-label="Workflow navigation">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.id"
          :ref="(el) => setTabRef(tab.id, el)"
          :to="tab.to"
          :aria-current="active === tab.id ? 'page' : undefined"
        >
          <i :class="tab.icon" aria-hidden="true" />{{ tab.label }}
          <span v-if="tab.count !== undefined" class="tab-count">{{ tab.count }}</span>
        </RouterLink>
        <span class="nav-indicator" :style="indicatorStyle" aria-hidden="true" />
      </nav>
      <RouterLink
        :to="`${basePath}/settings`"
        class="settings-link"
        :aria-current="active === 'settings' ? 'page' : undefined"
        aria-label="Workflow settings"
        v-tooltip.bottom="'Workflow settings'"
      >
        <i class="mdi mdi-cog-outline" aria-hidden="true" />
      </RouterLink>
    </div>

    <RouterView v-slot="{ Component, route: current }">
      <!-- Tabs stay mounted, so switching is instant and keeps scroll and open rows. They are
           cached per workflow, and each page refreshes itself when shown again. A run's page is
           not cached: it follows a live run. -->
      <KeepAlive :max="12" exclude="run-detail">
        <component
          :is="Component"
          :key="`${projectId}/${flowId}/${String(current.name)}`"
          class="tab-content"
        />
      </KeepAlive>
    </RouterView>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, provide } from "vue";
import { onBeforeRouteLeave, RouterLink, RouterView, useRoute } from "vue-router";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { workflowActionsKey } from "../composables/workflow-header-state";
import { provideWorkflowDocument } from "../composables/useWorkflowDocument";

type TabId = "configuration" | "builds" | "plan" | "runs" | "settings";

const actionsEl = ref<HTMLElement>();
provide(workflowActionsKey, actionsEl);

const route = useRoute();
const agent = useAgentAvailability();
const flowId = computed(() => String(route.params.flowId));
const projectId = computed(() => String(route.params.projectId));
const basePath = computed(() => `/workflows/${flowId.value}/${projectId.value}`);

const ROUTE_TAB: Record<string, TabId> = {
  Workflow: "configuration",
  WorkflowBuilds: "builds",
  WorkflowPlan: "plan",
  WorkflowRuns: "runs",
  WorkflowRunDetail: "runs",
  // Artifacts belong to runs, so they share the Runs tab.
  WorkflowArtifacts: "runs",
  WorkflowSettings: "settings",
};
const active = computed(() => ROUTE_TAB[String(route.name)] ?? "configuration");

const key = computed(() => `${projectId.value}/${flowId.value}`);

// The workflow is loaded, planned and saved here once, and shared with every tab.
const workflowDoc = provideWorkflowDocument({ flowId, projectId });
// The previous workflow stays in the document until the next one has loaded.
const current = computed(() =>
  workflowDoc.flow.value?.id === flowId.value ? workflowDoc.flow.value : undefined,
);
const title = computed(() => current.value?.name);
const planIssueCount = computed(
  () => workflowDoc.plan.value?.issues.filter((issue) => issue.severity === "error").length ?? 0,
);

const buildCount = computed(() => current.value?.builds.length);
const tabs = computed(() => [
  {
    id: "configuration" as const,
    label: "Configuration",
    icon: "mdi mdi-tune-variant",
    to: basePath.value,
  },
  {
    id: "builds" as const,
    label: "Builds",
    icon: "mdi mdi-hammer-wrench",
    to: `${basePath.value}/builds`,
    count: buildCount.value || undefined,
  },
  {
    id: "plan" as const,
    label: "Plan",
    icon: "mdi mdi-graph-outline",
    to: `${basePath.value}/plan`,
  },
  { id: "runs" as const, label: "Runs", icon: "mdi mdi-history", to: `${basePath.value}/runs` },
]);

watch(
  [() => agent.isReady.value, flowId, projectId],
  async () => {
    const { ok, hydrated } = await workflowDoc.load();
    // Kept drafts already have a plan scheduled; a freshly loaded workflow needs one.
    if (ok && hydrated) await workflowDoc.refreshPlan();
  },
  { immediate: true },
);

// Leaving the workflow (not just switching tabs) saves what is pending; if it cannot, stay.
onBeforeRouteLeave(async () => {
  try {
    await workflowDoc.flush();
    return true;
  } catch {
    return false;
  }
});
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (workflowDoc.hasUnsaved.value) event.preventDefault();
};
onMounted(() => window.addEventListener("beforeunload", warnBeforeUnload));
onUnmounted(() => window.removeEventListener("beforeunload", warnBeforeUnload));

// All tabs share one scroll container, so a shorter tab would reset the position of a taller one.
// Remember it per tab and put it back when the tab is shown again.
const scrollByTab = new Map<string, number>();
const scroller = () => nav.value?.closest<HTMLElement>(".layout-content") ?? undefined;
watch(
  () => String(route.name),
  async (to, from) => {
    const element = scroller();
    if (!element) return;
    scrollByTab.set(`${key.value}/${from}`, element.scrollTop);
    await nextTick();
    element.scrollTop = scrollByTab.get(`${key.value}/${to}`) ?? 0;
  },
  { flush: "pre" },
);

// Sliding underline under the active tab.
const nav = ref<HTMLElement>();
const tabRefs = new Map<TabId, HTMLElement>();
const setTabRef = (id: TabId, el: unknown) => {
  const element = (el as { $el?: HTMLElement } | null)?.$el;
  if (element) tabRefs.set(id, element);
  else tabRefs.delete(id);
};
const indicator = ref({ left: 0, width: 0, visible: false });
const indicatorStyle = computed(() => ({
  transform: `translateX(${indicator.value.left}px)`,
  width: `${indicator.value.width}px`,
  opacity: indicator.value.visible ? 1 : 0,
}));
const placeIndicator = async () => {
  await nextTick();
  const element = tabRefs.get(active.value as TabId);
  if (!element) {
    indicator.value = { ...indicator.value, visible: false };
    return;
  }
  indicator.value = {
    left: element.offsetLeft + 12,
    width: element.offsetWidth - 24,
    visible: true,
  };
};
watch([active, () => tabs.value.map((tab) => tab.count).join()], placeIndicator);
// Warm the other tabs once the page is idle, so a first visit does not wait on a download
// (or, under the dev server, on a compile).
const warmTabs = () =>
  void Promise.allSettled([
    import("../pages/workflow-builds.vue"),
    import("../pages/workflow-plan.vue"),
    import("../pages/workflow-runs.vue"),
    import("../pages/workflow-settings.vue"),
  ]);
onMounted(() => {
  void placeIndicator();
  if ("requestIdleCallback" in window) window.requestIdleCallback(warmTabs, { timeout: 3000 });
  else setTimeout(warmTabs, 1500);
  window.addEventListener("resize", placeIndicator);
});
onUnmounted(() => window.removeEventListener("resize", placeIndicator));
</script>

<style scoped>
.workflow-shell {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 20px clamp(16px, 3vw, 40px) 64px;
  box-sizing: border-box;
}
.workflow-header {
  display: grid;
  gap: 14px;
  margin-bottom: 28px;
}
.workflow-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 3px 8px 3px 4px;
  margin-left: -4px;
  border-radius: 8px;
  color: var(--pl-muted);
  font-size: 0.8rem;
  font-weight: 500;
  text-decoration: none;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.workflow-back:hover {
  color: var(--p-text-color);
  background: var(--pl-hover);
}
.workflow-back:focus-visible,
.workflow-nav a:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
.workflow-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px 24px;
  flex-wrap: wrap;
}
.workflow-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.workflow-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  color: var(--pl-accent);
  background: linear-gradient(
    145deg,
    var(--pl-sunken),
    color-mix(in srgb, var(--p-text-color) 7%, var(--p-content-background))
  );
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  box-shadow: var(--pl-shadow-xs);
  font-size: 22px;
}
.workflow-heading {
  min-width: 0;
}
.workflow-heading h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}
.workflow-heading p {
  margin: 3px 0 0;
  color: var(--pl-muted);
  font-size: 0.84rem;
}
.workflow-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.workflow-header {
  margin-bottom: 0;
}
.workflow-nav-bar {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 28px;
  background: var(--pl-sunken);
  border-bottom: 1px solid var(--pl-border);
}
.workflow-nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.workflow-nav a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  color: var(--pl-muted);
  border-radius: 8px 8px 0 0;
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 500;
  white-space: nowrap;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.workflow-nav a i {
  font-size: 1.05rem;
  opacity: 0.75;
}
.workflow-nav a:hover {
  color: var(--p-text-color);
  background: var(--pl-hover);
}
.workflow-nav a[aria-current="page"] {
  color: var(--p-text-color);
  font-weight: 600;
}
.workflow-nav a[aria-current="page"] i {
  opacity: 1;
}
.nav-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--pl-accent);
  transition:
    transform 0.28s var(--pl-ease),
    width 0.28s var(--pl-ease),
    opacity 0.15s;
}
.tab-count {
  min-width: 18px;
  padding: 0 6px;
  color: var(--pl-muted);
  background: var(--pl-sunken);
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.settings-link {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--pl-muted);
  border-radius: 10px;
  font-size: 1.15rem;
  text-decoration: none;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.settings-link:hover,
.settings-link[aria-current="page"] {
  color: var(--p-text-color);
  background: var(--pl-hover);
}
.settings-link:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
.issue-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  color: var(--p-orange-600, #ea580c);
  background: color-mix(in srgb, var(--p-orange-500, #f97316) 12%, transparent);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: none;
}
.title-skeleton {
  width: 160px;
  height: 1.5rem;
  border-radius: 8px;
  background: var(--pl-sunken);
  animation: title-pulse 1.2s ease-in-out infinite;
}
@keyframes title-pulse {
  50% {
    opacity: 0.5;
  }
}
/* Reserve the scrollbar's width on workflow pages, so it appearing as content loads cannot
   shift the layout sideways. */
:global(.layout-content:has(.workflow-shell)) {
  scrollbar-gutter: stable;
}
@media (prefers-reduced-motion: reduce) {
  .nav-indicator {
    transition: none;
  }
  .title-skeleton {
    animation: none;
  }
}
@media (max-width: 640px) {
  .workflow-shell {
    padding: 14px 14px 40px;
  }
  .workflow-titlebar {
    align-items: flex-start;
  }
  .workflow-actions {
    justify-content: flex-start;
  }
  .workflow-nav a {
    flex: 0 0 auto;
    padding-inline: 10px;
  }
}
</style>
