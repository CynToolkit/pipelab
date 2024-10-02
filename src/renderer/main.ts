import { createApp } from 'vue'
import Root from './Root.vue'
import { router } from './router/router'

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/nora'
import Lara from '@primevue/themes/lara'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import '@mdi/font/css/materialdesignicons.css'
import { definePreset } from '@primevue/themes'
import './style/main.scss'
import VueDOMPurifyHTML from 'vue-dompurify-html'

import { init } from '@sentry/electron/renderer'
import { breadcrumbsIntegration, init as vueInit } from '@sentry/vue'
import ToastService from 'primevue/toastservice'

let bugsnagVue: any
if (window.isPackaged && process.env.TEST !== 'true') {
  init(
    {
      dsn: 'https://757630879674735027fa5700162253f7@o45694.ingest.us.sentry.io/4507621723144192',
      debug: true,
      integrations: [
        breadcrumbsIntegration({
          console: false
        })
      ]
    },
    vueInit
  )
}

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const PipelabPreset = definePreset(Lara, {
  semantic: {
    transitionDuration: '0.2s',
    focusRing: {
      width: '1px',
      style: 'solid',
      color: '{primary.color}',
      offset: '2px',
      shadow: 'none'
    },
    disabledOpacity: '0.6',
    iconSize: '1rem',
    anchorGutter: '2px',
    primary: {
      50: '{zinc.50}',
      100: '{zinc.100}',
      200: '{zinc.200}',
      300: '{zinc.300}',
      400: '{zinc.400}',
      500: '{zinc.500}',
      600: '{zinc.600}',
      700: '{zinc.700}',
      800: '{zinc.800}',
      900: '{zinc.900}',
      950: '{zinc.950}'
    },
    colorScheme: {
      light: {
        primary: {
          color: '{zinc.950}',
          inverseColor: '#ffffff',
          hoverColor: '{zinc.900}',
          activeColor: '{zinc.800}'
        },
        highlight: {
          background: '{zinc.950}',
          focusBackground: '{zinc.700}',
          color: '#ffffff',
          focusColor: '#ffffff'
        }
      },
      dark: {
        primary: {
          color: '{zinc.50}',
          inverseColor: '{zinc.950}',
          hoverColor: '{zinc.100}',
          activeColor: '{zinc.200}'
        },
        highlight: {
          background: 'rgba(250, 250, 250, .16)',
          focusBackground: 'rgba(250, 250, 250, .24)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)'
        }
      }
    }
  }
})

// init({
//   vueInit,
//   integrations: [
//     browserTracingIntegration({ router }),
//     replayIntegration(),
//   ],

//   // Set tracesSampleRate to 1.0 to capture 100%
//   // of transactions for performance monitoring.
//   // We recommend adjusting this value in production
//   tracesSampleRate: 1.0,

//   // Capture Replay for 10% of all sessions,
//   // plus for 100% of sessions with an error
//   replaysSessionSampleRate: 0.1,
//   replaysOnErrorSampleRate: 1.0,
// });

const app = createApp(Root)

app.use(router)
app.use(pinia)
app.use(VueDOMPurifyHTML)
app.use(PrimeVue, {
  theme: {
    preset: PipelabPreset,
    options: {
      darkModeSelector: 'light'
    }
  }
})
app.use(ToastService)

if (bugsnagVue) {
  app.use(bugsnagVue)
}

app.mount('#app')
