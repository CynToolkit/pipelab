import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { shouldAutoConnectAgentOnStartup } from "./ui-runtime";

describe("useAgentAvailability", () => {
  it("registers startup readiness before connecting and clears readiness on disconnect", async () => {
    vi.resetModules();
    const connectionState = ref("disconnected");
    const stateListeners: Array<(state: string) => void> = [];
    const events = new Map<string, (event: { type: string }) => void>();
    const callOrder: string[] = [];
    const manager = {
      connectionState,
      onStateChange: (listener: (state: string) => void) => stateListeners.push(listener),
      connect: vi.fn(async () => {
        callOrder.push("connect");
        connectionState.value = "connected";
        stateListeners.forEach((listener) => listener("connected"));
      }),
    };

    vi.doMock("./websocket-manager", () => ({ websocketManager: manager }));
    vi.doMock("./websocket-client", () => ({
      useWebSocketAPI: () => ({
        on: (channel: string, listener: (event: { type: string }) => void) => {
          callOrder.push(`listen:${channel}`);
          events.set(channel, listener);
        },
      }),
    }));

    const { useAgentAvailability } = await import("./useAgentAvailability");
    const agent = useAgentAvailability();
    await agent.start();

    expect(callOrder).toEqual(["listen:startup:progress", "connect"]);
    expect(agent.status.value).toBe("starting");
    events.get("startup:progress")?.({ type: "done" });
    expect(agent.isReady.value).toBe(true);

    connectionState.value = "disconnected";
    stateListeners.forEach((listener) => listener("disconnected"));
    expect(agent.status.value).toBe("offline");
    expect(agent.isReady.value).toBe(false);

    // Startup policy may skip `start()` in a published browser, while an
    // explicit trusted attach can still use the lazy connection path later.
    await agent.reconnect();
    expect(callOrder.filter((call) => call === "connect")).toHaveLength(2);
    expect(agent.status.value).toBe("starting");
    events.get("startup:progress")?.({ type: "done" });
    expect(agent.isReady.value).toBe(true);
  });

  it("allows explicit attach when a published browser skips startup discovery", async () => {
    vi.resetModules();
    const connectionState = ref("disconnected");
    const stateListeners: Array<(state: string) => void> = [];
    const events = new Map<string, (event: { type: string }) => void>();
    const manager = {
      connectionState,
      onStateChange: (listener: (state: string) => void) => stateListeners.push(listener),
      connect: vi.fn(async () => {
        connectionState.value = "connected";
        stateListeners.forEach((listener) => listener("connected"));
      }),
    };
    vi.doMock("./websocket-manager", () => ({ websocketManager: manager }));
    vi.doMock("./websocket-client", () => ({
      useWebSocketAPI: () => ({
        on: (channel: string, listener: (event: { type: string }) => void) => {
          events.set(channel, listener);
        },
      }),
    }));

    const { useAgentAvailability } = await import("./useAgentAvailability");
    const agent = useAgentAvailability();
    expect(shouldAutoConnectAgentOnStartup("browser", "hosted")).toBe(false);
    expect(agent.isReady.value).toBe(false);

    await agent.reconnect();
    events.get("startup:progress")?.({ type: "done" });
    expect(manager.connect).toHaveBeenCalledOnce();
    expect(agent.isReady.value).toBe(true);
  });
});
