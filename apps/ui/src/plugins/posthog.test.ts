import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { init, getProperty, reset } = vi.hoisted(() => ({
  init: vi.fn(),
  getProperty: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("posthog-js", () => ({
  default: { init, get_property: getProperty, reset },
}));

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
    getProperty.mockReset();
    reset.mockReset();
    init.mockReturnValue({ get_property: getProperty, reset });
    getProperty.mockReturnValue("anonymous");
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
      loaded: expect.any(Function),
    });
  });

  it("resets legacy authenticated identity before the initial pageview", () => {
    setLocation("/dashboard");
    getProperty.mockReturnValue("identified");

    install();

    const [, options] = init.mock.calls[0];
    options.loaded({ get_property: getProperty, reset });

    expect(getProperty).toHaveBeenCalledWith("$user_state");
    expect(reset).toHaveBeenCalledOnce();
  });

  it("preserves anonymous visitor identity during PostHog initialization", () => {
    setLocation("/dashboard");

    install();

    const [, options] = init.mock.calls[0];
    options.loaded({ get_property: getProperty, reset });

    expect(reset).not.toHaveBeenCalled();
  });
});
