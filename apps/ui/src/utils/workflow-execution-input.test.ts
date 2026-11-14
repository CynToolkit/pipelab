import { describe, expect, it, vi } from "vitest";
import { submitDesktopWorkflowExecution } from "./workflow-execution-input";

describe("Desktop workflow execution submission", () => {
  it("sends the values the Desktop shell returned, with the local Connection values", async () => {
    const readEnvironment = vi.fn(async () => ({
      PROJECT_PATH: "/desktop/game",
      PREFIXED: "value",
      MISSING: undefined,
    }));
    const execute = vi.fn(async (request) => request);
    const connectionValues = { "itch-production": { apiKey: "provider-secret" } };

    await submitDesktopWorkflowExecution({
      request: {
        name: "workflows/release-1",
        release: { version: "4.2.0", description: "" },
        connectionValues,
      },
      readEnvironment,
      execute,
    });

    expect(execute).toHaveBeenCalledWith({
      name: "workflows/release-1",
      release: { version: "4.2.0", description: "" },
      env: { PROJECT_PATH: "/desktop/game", PREFIXED: "value" },
      connectionValues,
    });
  });

  it("submits an empty client environment instead of falling back to the Host environment", async () => {
    const execute = vi.fn(async (request) => request);

    await submitDesktopWorkflowExecution({
      request: { name: "workflows/release-1" },
      readEnvironment: async () => ({}),
      execute,
    });

    expect(execute).toHaveBeenCalledWith({ name: "workflows/release-1", env: {} });
  });
});
