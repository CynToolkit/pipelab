//./plugins/posthog.js
import posthog from "posthog-js";

export default {
  install(app: any) {
    const apiKey = process.env.POSTHOG_API_KEY;

    if (!apiKey || apiKey === "${POSTHOG_API_KEY}") {
      console.warn("PostHog API Key is not configured. Telemetry is disabled.");
      app.config.globalProperties.$posthog = {
        capture: () => {},
        identify: () => {},
        reset: () => {},
        opt_in_capturing: () => {},
        opt_out_capturing: () => {},
        onFeatureFlags: () => {},
        getFeatureFlag: () => {},
      };
      return;
    }

    app.config.globalProperties.$posthog = posthog.init(apiKey, {
      api_host: "https://eu.i.posthog.com",
    });
  },
};
