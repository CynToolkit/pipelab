import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { init } = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { init } }));

import posthogPlugin from "./posthog";

const install = () => {
  const app = { config: { globalProperties: {} } };
  posthogPlugin.install(app);
  return app;
};

const setLocation = (url: string) =>
  vi.stubGlobal("window", {
    location: { pathname: new URL(url, "https://pipelab.test").pathname },
  });

describe("PostHog auth callback privacy", () => {
  beforeEach(() => {
    init.mockReset();
    init.mockReturnValue({});
    vi.stubEnv("POSTHOG_API_KEY", "test-api-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    "/auth/callback?code=short-lived-code",
    "/auth/callback?type=recovery&code=short-lived-code",
    "/auth/callback?error=provider-error&error_description=details",
  ])("disables pageview and autocapture before callback parameters are cleared (%s)", (url) => {
    setLocation(url);
    install();

    expect(init).toHaveBeenCalledWith(
      "test-api-key",
      expect.objectContaining({
        capture_pageview: false,
        autocapture: false,
      }),
    );
  });

  it("keeps normal telemetry configuration on non-callback routes", () => {
    setLocation("/dashboard");

    install();

    expect(init).toHaveBeenCalledWith("test-api-key", {
      api_host: "https://eu.i.posthog.com",
    });
  });
});
