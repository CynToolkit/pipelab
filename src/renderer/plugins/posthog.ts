//./plugins/posthog.js
import posthog from 'posthog-js'

export default {
  install(app: any) {
    app.config.globalProperties.$posthog = posthog.init(__POSTHOG_API_KEY__, {
      api_host: 'https://eu.i.posthog.com'
    })
  }
}
