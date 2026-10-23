declare global {
  interface Window {
    __POSTHOG_API_KEY__: string
  }

  const __POSTHOG_API_KEY__: string
}

export {}
