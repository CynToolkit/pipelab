import { afterEach, describe, expect, it, vi } from "vitest";
import { useLogger } from "@pipelab/shared";
import { WebSocket } from "ws";
import { useAPI } from "./ipc-core";

describe("workflow execution IPC logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not log environment values submitted by the initiating client", async () => {
    const { handle, processWebSocketMessage } = useAPI();
    const secret = "client-workflow-secret";
    const debug = vi.spyOn(useLogger().logger(), "debug");
    handle("workflow:execute", async () => undefined);

    await processWebSocketMessage({ url: "test-client" } as WebSocket, "workflow:execute", {
      requestId: "request-1",
      data: { name: "workflows/release", env: { PUBLISH_TOKEN: secret } },
    } as never);

    expect(JSON.stringify(debug.mock.calls)).not.toContain(secret);
  });
});
