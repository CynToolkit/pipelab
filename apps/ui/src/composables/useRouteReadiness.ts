import { computed, onScopeDispose, reactive, watch, type Ref } from "vue";

type SubsystemStatus = "idle" | "loading" | "ready" | "error";

export const ROUTE_READY_TIMEOUT_MS = 8000;

const sources = reactive(new Map<symbol, boolean>());

/** Number of mounted routes that registered readiness and are still loading their first data. */
export const pendingRouteCount = computed(
  () => [...sources.values()].filter((ready) => !ready).length,
);

/**
 * Lets a route tell the startup screen when its first data is ready.
 * Must be called from `setup`; the registration is dropped when the component unmounts.
 */
export const useRouteReadiness = (ready: Ref<boolean>) => {
  const id = Symbol("route-readiness");
  watch(ready, (value) => sources.set(id, value), {
    immediate: true,
    flush: "sync",
  });
  onScopeDispose(() => sources.delete(id));
};

export interface StartupGateInput {
  agent: "offline" | "connecting" | "starting" | "ready";
  projects: SubsystemStatus;
  runtime: SubsystemStatus;
  providers: SubsystemStatus;
  routerReady: boolean;
  pendingRoutes: number;
  routeTimedOut: boolean;
}

export type StartupGateState = "waiting" | "route" | "open" | "failed";

/**
 * waiting: agent data is still loading; route: data is ready, waiting on the route;
 * open: show the app; failed: show the app so its error/offline states are visible.
 */
export const resolveStartupGate = (input: StartupGateInput): StartupGateState => {
  if (
    input.agent === "offline" ||
    input.projects === "error" ||
    input.runtime === "error" ||
    input.providers === "error"
  )
    return "failed";
  const dataReady =
    input.agent === "ready" &&
    input.projects === "ready" &&
    input.runtime === "ready" &&
    input.providers === "ready";
  if (!dataReady) return "waiting";
  if (input.routeTimedOut) return "open";
  return input.routerReady && input.pendingRoutes === 0 ? "open" : "route";
};
