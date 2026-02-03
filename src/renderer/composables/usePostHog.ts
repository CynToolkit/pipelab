import posthog from 'posthog-js'

export function usePostHog() {
  posthog.init(__POSTHOG_API_KEY__, {
    api_host: 'https://eu.i.posthog.com'
  })

  return { posthog }
}
