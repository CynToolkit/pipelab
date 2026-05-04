import posthog from "posthog-js";

export function usePostHog() {
  posthog.init(process.env.POSTHOG_API_KEY as string, {
    api_host: "https://eu.i.posthog.com",
  });

  return { posthog };
}
