//./plugins/posthog.js
import posthog from "posthog-js";

export default {
  install(app: any) {
    app.config.globalProperties.$posthog = posthog.init(process.env.POSTHOG_API_KEY as string, {
      api_host: "https://eu.i.posthog.com",
    });
  },
};
