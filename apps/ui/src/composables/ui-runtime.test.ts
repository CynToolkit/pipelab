import { describe, expect, it } from "vitest";
import { getUiEnvironment, shouldAutoConnectAgentOnStartup } from "./ui-runtime";

describe("UI runtime environment and startup policy", () => {
  it("detects browser and desktop environments independently of startup policy", () => {
    expect(getUiEnvironment(false)).toBe("browser");
    expect(getUiEnvironment(true)).toBe("desktop");
  });

  it("uses configuration only to control automatic startup, never explicit browser attachment", () => {
    expect(shouldAutoConnectAgentOnStartup("browser", "hosted")).toBe(false);
    expect(shouldAutoConnectAgentOnStartup("browser", undefined)).toBe(true);
    expect(shouldAutoConnectAgentOnStartup("desktop", "hosted")).toBe(true);
  });
});
