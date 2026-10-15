import "./assets/main.css";

import { createApp } from "vue";
import { createPinia } from "pinia";

import PrimeVue from "primevue/config";
import type { Plugin } from "vue";
import Aura from "@primevue/themes/aura";

import App from "./App.vue";
import router from "./router";
import { loadThirdPartyScripts } from "./utils/third-party-scripts";

const app = createApp(App);

// The hoisted workspace install gives PrimeVue's types a different Vue peer copy.
app.use(PrimeVue as unknown as Plugin, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: ".my-app-dark",
    },
  },
});

app.use(createPinia());
app.use(router);

app.mount("#app");

void router.isReady().then(() => {
  loadThirdPartyScripts(router.currentRoute.value.path);
});
