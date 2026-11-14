<template>
  <div class="workflow-page">
    <main class="plan-page" :aria-busy="planning">
      <header class="list-heading">
        <h2>Plan</h2>
        <Button
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          aria-label="Refresh plan"
          v-tooltip.top="'Refresh plan'"
          :loading="planning"
          @click="load"
        />
      </header>

      <Message v-if="error" severity="error" :closable="false" role="alert">{{ error }}</Message>
      <p v-else-if="!agent.isReady.value && !plan" class="state-copy" role="status">
        The plan is unavailable while the engine is disconnected.
      </p>

      <template v-if="layout">
        <div class="viewport" role="group" aria-label="Plan graph. Drag to pan, scroll to zoom.">
          <VueFlow
            id="plan-graph"
            :nodes="flowNodes"
            :edges="flowEdges"
            :nodes-draggable="false"
            :nodes-connectable="false"
            :elements-selectable="false"
            :zoom-on-double-click="false"
            :min-zoom="0.2"
            :max-zoom="2.5"
            @init="frame"
            :default-viewport="{ x: 0, y: 0, zoom: 1 }"
          >
            <Background
              :gap="20"
              pattern-color="color-mix(in srgb, currentColor 18%, transparent)"
            />
            <Controls :show-interactive="false" position="top-right" />

            <template #node-plan="{ data }">
              <Handle type="target" :position="Position.Left" class="hidden-handle" />
              <div :class="['node', `kind-${data.kind}`]">
                <span class="node-icon">
                  <img
                    v-if="providerIconImage(data.icon)"
                    :src="providerIconImage(data.icon)"
                    alt=""
                  />
                  <i
                    v-else
                    :class="providerIconClass(data.icon, FALLBACK_ICON[data.kind as PlanNodeKind])"
                    aria-hidden="true"
                  />
                </span>
                <span class="node-copy">
                  <strong>{{ data.label }}</strong>
                  <small v-if="data.detail">{{ data.detail }}</small>
                </span>
              </div>
              <Handle type="source" :position="Position.Right" class="hidden-handle" />
            </template>

            <template #edge-plan="{ id, data, markerEnd }">
              <BaseEdge :id="id" :path="edgePath(data.points)" :marker-end="markerEnd" />
            </template>
          </VueFlow>
        </div>
        <ul class="legend" aria-label="Legend">
          <li class="kind-source">Source</li>
          <li class="kind-build">Build</li>
          <li class="kind-automatic">Automatic step</li>
          <li class="kind-destination">Destination</li>
        </ul>
      </template>

      <ul v-if="plan?.issues.length" class="plan-issues" aria-label="Planner issues">
        <li v-for="(issue, index) in plan.issues" :key="index" :class="issue.severity">
          <i
            :class="
              issue.severity === 'error' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'
            "
            aria-hidden="true"
          />
          {{ issue.message }}
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useWorkflowTab } from "../composables/workflow-header-state";
import { computed, nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import { BaseEdge, Handle, MarkerType, Position, useVueFlow, VueFlow } from "@vue-flow/core";
import type { Edge, Node } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import { useRouteReadiness } from "@renderer/composables/useRouteReadiness";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { useWorkflowDocument } from "../composables/useWorkflowDocument";
import { useAppStore } from "../store/app";
import { providerIconClass, providerIconImage } from "../utils/provider-icons";
import {
  layoutPlanGraph,
  PLAN_NODE_HEIGHT,
  PLAN_NODE_WIDTH,
  type PlanGraphLayout,
  type PlanNodeKind,
} from "./workflow-plan-graph";

const FALLBACK_ICON = {
  source: "mdi mdi-file-code-outline",
  build: "mdi mdi-hammer-wrench",
  automatic: "mdi mdi-auto-fix",
  destination: "mdi mdi-rocket-launch-outline",
} as const;

const route = useRoute();
useWorkflowTab(() => void workflowDoc.sync());
const agent = useAgentAvailability();
const appStore = useAppStore();
const { fitView } = useVueFlow("plan-graph");
const flowId = computed(() => String(route.params.flowId));
const projectId = computed(() => String(route.params.projectId));

// The plan belongs to the shared workflow document; this page only draws it.
const workflowDoc = useWorkflowDocument({ flowId, projectId });
const { flow, plan, planning } = workflowDoc;
const layout = ref<PlanGraphLayout>();
const layoutError = ref("");
const error = computed(
  () => workflowDoc.plannerError.value || workflowDoc.loadError.value || layoutError.value,
);
useRouteReadiness(computed(() => !agent.isReady.value || !!plan.value || !!error.value));

const flowNodes = computed<Node[]>(() =>
  (layout.value?.nodes ?? []).map((node) => ({
    id: node.id,
    type: "plan",
    position: { x: node.x, y: node.y },
    data: { kind: node.kind, label: node.label, detail: node.detail, icon: node.icon },
    style: { width: `${PLAN_NODE_WIDTH}px`, height: `${PLAN_NODE_HEIGHT}px` },
    draggable: false,
    selectable: false,
    connectable: false,
  })),
);
const flowEdges = computed<Edge[]>(() =>
  (layout.value?.edges ?? []).map((edge) => ({
    id: edge.id,
    type: "plan",
    source: edge.from,
    target: edge.to,
    data: { points: edge.points },
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#94a3b8" },
    selectable: false,
    focusable: false,
  })),
);
// Sharp corners on purpose: the points already come with right angles.
const edgePath = (points: Array<{ x: number; y: number }>) =>
  points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");

let viewportReady = false;
const frame = () => {
  viewportReady = true;
  void fitView({ padding: 0.12, maxZoom: 1 });
};

let layoutGeneration = 0;
// Lay the plan out whenever it changes (an edit on any tab, or a refresh).
watch(
  plan,
  async (value) => {
    const current = ++layoutGeneration;
    const config = flow.value;
    if (!value || !config) {
      layout.value = undefined;
      return;
    }
    try {
      const laidOut = await layoutPlanGraph(
        value.graph,
        config,
        appStore.releaseCatalog,
        appStore.providerDefinitions,
        value,
      );
      if (current !== layoutGeneration) return;
      layoutError.value = "";
      layout.value = laidOut;
      // On a refresh the graph is already mounted, so frame the new layout here; the first
      // render is framed by the `init` event once Vue Flow has measured its viewport.
      if (viewportReady) {
        await nextTick();
        frame();
      }
    } catch (cause) {
      if (current === layoutGeneration) {
        layout.value = undefined;
        layoutError.value = cause instanceof Error ? cause.message : String(cause);
      }
    }
  },
  { immediate: true },
);

const load = () => void workflowDoc.refreshPlan();
</script>

<style scoped>
.plan-page {
  display: grid;
  gap: 16px;
}
.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.list-heading h2 {
  margin: 0;
  font-size: 1.1rem;
}
.viewport {
  position: relative;
  height: min(520px, 62vh);
  overflow: hidden;
  border: 1px solid var(--pl-border, var(--p-content-border-color));
  border-radius: 12px;
  background: var(--p-content-background, transparent);
  color: var(--p-text-muted-color);
}
.viewport:focus-within {
  box-shadow: var(--pl-ring);
}
.viewport :deep(.vue-flow__edge-path) {
  stroke: #94a3b8;
  stroke-width: 1.5;
  stroke-linejoin: miter;
  stroke-linecap: butt;
}
.viewport :deep(.vue-flow__node-plan) {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  cursor: default;
}
.viewport :deep(.hidden-handle) {
  opacity: 0;
  pointer-events: none;
}
.viewport :deep(.vue-flow__controls) {
  overflow: hidden;
  border: 1px solid var(--pl-border, var(--p-content-border-color));
  border-radius: 10px;
  box-shadow: var(--pl-shadow-xs);
}
.viewport :deep(.vue-flow__controls-button) {
  color: var(--p-text-color);
  background: var(--pl-card, var(--p-content-background));
  border-bottom-color: var(--pl-border, var(--p-content-border-color));
}
.viewport :deep(.vue-flow__controls-button:hover) {
  background: var(--pl-hover, var(--p-content-hover-background));
}
.viewport :deep(.vue-flow__controls-button svg) {
  fill: currentColor;
}
.node {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 14px 0 12px;
  color: var(--p-text-color);
  background: var(--pl-card, var(--p-content-background));
  border: 1px solid var(--pl-border, var(--p-content-border-color));
  border-radius: 12px;
  box-shadow: var(--pl-shadow-xs);
  --node-accent: var(--p-text-muted-color);
}
.node-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--node-accent);
  background: color-mix(in srgb, var(--node-accent) 12%, transparent);
  border-radius: 10px;
  font-size: 17px;
}
.node-icon img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.node-copy {
  display: grid;
  min-width: 0;
  text-align: left;
}
.node-copy strong,
.node-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-copy strong {
  font-size: 0.85rem;
}
.node-copy small {
  color: var(--p-text-muted-color);
  font-size: 0.72rem;
}
.node.kind-source {
  border-style: dashed;
}
.kind-build {
  --node-accent: var(--pl-accent, var(--p-primary-color));
}
.kind-destination {
  --node-accent: var(--p-green-500, #22c55e);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
.legend li {
  --node-accent: var(--p-text-muted-color);
}
.legend li::before {
  content: "";
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  background: color-mix(in srgb, var(--node-accent) 25%, transparent);
  border: 1.5px solid var(--node-accent);
  border-radius: 3px;
}
.legend .kind-build {
  --node-accent: var(--pl-accent, var(--p-primary-color));
}
.legend .kind-destination {
  --node-accent: var(--p-green-500, #22c55e);
}
.plan-issues {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}
.plan-issues .error {
  color: var(--p-red-500, #ef4444);
}
.plan-issues .warning {
  color: var(--p-orange-500, #f97316);
}
.state-copy {
  color: var(--p-text-muted-color);
}
</style>
