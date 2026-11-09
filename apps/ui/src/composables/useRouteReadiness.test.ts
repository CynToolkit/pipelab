import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import {
  pendingRouteCount,
  resolveStartupGate,
  useRouteReadiness,
  type StartupGateInput,
} from "./useRouteReadiness";

const base: StartupGateInput = {
  agent: "ready",
  projects: "ready",
  runtime: "ready",
  providers: "ready",
  routerReady: true,
  pendingRoutes: 0,
  routeTimedOut: false,
};

describe("resolveStartupGate", () => {
  it("waits while any subsystem is still loading", () => {
    expect(resolveStartupGate({ ...base, projects: "loading" })).toBe("waiting");
    expect(resolveStartupGate({ ...base, runtime: "idle" })).toBe("waiting");
    expect(resolveStartupGate({ ...base, agent: "starting" })).toBe("waiting");
  });

  it("waits for the router and pending routes once data is ready", () => {
    expect(resolveStartupGate({ ...base, routerReady: false })).toBe("route");
    expect(resolveStartupGate({ ...base, pendingRoutes: 1 })).toBe("route");
    expect(resolveStartupGate(base)).toBe("open");
  });

  it("opens after the route timeout even if a route is still pending", () => {
    expect(resolveStartupGate({ ...base, pendingRoutes: 2, routeTimedOut: true })).toBe("open");
  });

  it("fails open on offline or error states", () => {
    expect(resolveStartupGate({ ...base, agent: "offline" })).toBe("failed");
    expect(resolveStartupGate({ ...base, projects: "error" })).toBe("failed");
    expect(resolveStartupGate({ ...base, runtime: "error" })).toBe("failed");
    expect(resolveStartupGate({ ...base, providers: "error", pendingRoutes: 1 })).toBe("failed");
  });
});

describe("useRouteReadiness", () => {
  it("tracks pending routes and releases them on dispose", async () => {
    const ready = ref(false);
    const scope = effectScope();
    scope.run(() => useRouteReadiness(ready));
    expect(pendingRouteCount.value).toBe(1);
    ready.value = true;
    await nextTick();
    expect(pendingRouteCount.value).toBe(0);
    ready.value = false;
    expect(pendingRouteCount.value).toBe(1);
    scope.stop();
    expect(pendingRouteCount.value).toBe(0);
  });
});
