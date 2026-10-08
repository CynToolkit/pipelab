import { describe, expect, it } from "vitest";
import { getUiRuntimeMode, shouldStartAgentConnection } from "./ui-runtime";

describe("UI runtime mode", () => {
  it("uses hosted mode only when the build explicitly selects it", () => {
    expect(getUiRuntimeMode(false, "hosted")).toBe("hosted");
    expect(getUiRuntimeMode(false, undefined)).toBe("agent");
  });

  it("keeps Electron in desktop mode even if the hosted build flag is present", () => {
    expect(getUiRuntimeMode(true, "hosted")).toBe("desktop");
  });

  it("starts an agent connection in desktop and agent-capable browser modes only", () => {
    expect(shouldStartAgentConnection("desktop")).toBe(true);
    expect(shouldStartAgentConnection("agent")).toBe(true);
    expect(shouldStartAgentConnection("hosted")).toBe(false);
  });
});
