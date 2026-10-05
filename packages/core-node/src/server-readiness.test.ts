import { expect, it, vi } from "vitest";
import { sendStartupReady } from "./server";
import { webSocketServer } from "./websocket-server";

it("the host emits the startup completion event consumed by the UI", () => {
  const broadcast = vi.spyOn(webSocketServer, "broadcast").mockImplementation(() => {});
  try {
    sendStartupReady();
    expect(broadcast).toHaveBeenCalledWith("startup:progress", { type: "done" });
  } finally {
    broadcast.mockRestore();
  }
});
