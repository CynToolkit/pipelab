<template>
  <div>
    <header class="header">
      <div class="container">
        <div class="flex align-items-center justify-content-between py-3">
          <div class="logo">
            <RouterLink class="nav-link-logo" :to="{ name: 'Home' }">
              <img
                height="48"
                src="/banner.png"
                alt="Pipelab"
                class="logo-img"
              />
            </RouterLink>
          </div>
          <nav class="hidden lg:flex">
            <component
              v-for="item in menuItems"
              :key="item.label"
              :is="item.external ? 'a' : 'RouterLink'"
              :to="!item.external ? item.to : undefined"
              :href="item.external ? item.to : undefined"
              class="nav-link"
              :class="{ 'icon-only': item.iconOnly }"
              :target="item.external ? '_blank' : undefined"
              :rel="item.external ? 'noopener noreferrer' : undefined"
              :disabled="item.disabled"
            >
              <i v-if="typeof item.icon === 'string'" :class="item.icon"></i>
              <component v-else :is="item.icon"></component>
              <span v-if="!item.iconOnly">{{ item.label }}</span>
            </component>
          </nav>
          <Button
            icon="pi pi-bars"
            @click="toggleMobileMenu"
            class="primary-btn lg:hidden"
          />
        </div>
      </div>
    </header>
    <div v-if="mobileMenuOpen" class="mobile-menu lg:hidden">
      <component
        v-for="item in menuItems"
        :key="item.label"
        :is="item.external ? 'a' : 'RouterLink'"
        :to="!item.external ? item.to : undefined"
        :href="item.external ? item.to : undefined"
        :target="item.external ? '_blank' : undefined"
        :rel="item.external ? 'noopener noreferrer' : undefined"
        :disabled="item.disabled"
        class="mobile-nav-link"
        @click="closeMobileMenu"
      >
        <i :class="item.icon"></i>
        {{ item.label }}
      </component>
    </div>
    <main class="main-content">
      <RouterView></RouterView>
    </main>
    <footer class="footer">
      <div class="container">
        <div class="grid py-6">
          <div class="col-12 md:col-4">
            <div class="footer-brand">
              <img
                height="32"
                src="/banner.png"
                alt="Pipelab"
                class="mb-3"
              />
              <p class="text-sm opacity-70">
                The visual automation tool for game developers.
              </p>
              <p class="text-sm opacity-50 mt-4">
                © 2026 Pipelab. All rights reserved.
              </p>
            </div>
          </div>
          <div class="col-6 md:col-4">
            <h4 class="footer-title mb-4">Legal</h4>
            <ul class="list-none p-0 m-0">
              <li class="mb-2">
                <RouterLink :to="{ name: 'Privacy' }" class="footer-link">Privacy Policy</RouterLink>
              </li>
              <li class="mb-2">
                <RouterLink :to="{ name: 'Terms' }" class="footer-link">Terms of Service</RouterLink>
              </li>
            </ul>
          </div>
          <div class="col-6 md:col-4">
            <h4 class="footer-title mb-4">Support</h4>
            <ul class="list-none p-0 m-0">
              <li class="mb-2">
                <a href="mailto:contact@pipelab.app" class="footer-link">Contact Us</a>
              </li>
              <li class="mb-2">
                <a href="//discord.gg/MzNw26cBb5" target="_blank" rel="noopener" class="footer-link">Community Discord</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import Button from "primevue/button";
import "primeflex/primeflex.css";
import "primeicons/primeicons.css";

import SimpleIconsMastodon from "~icons/simple-icons/mastodon";
import SimpleIconsBluesky from "~icons/simple-icons/bluesky";
import SimpleIconsDiscord from "~icons/simple-icons/discord";
import SimpleIconsGithub from "~icons/simple-icons/github";
import SimpleIconsX from "~icons/simple-icons/x";
import SimpleIconsGmail from "~icons/simple-icons/gmail";

const menuItems = ref([
  { label: "Home", icon: "pi pi-home", to: { name: "Home" } },
  {
    label: "Features",
    icon: "pi pi-star",
    to: { name: "Home", hash: "#features" },
  },
  {
    label: "Testimonials",
    icon: "pi pi-star",
    to: { name: "Home", hash: "#testimonials" },
  },
  {
    label: "Pricing",
    icon: "pi pi-dollar",
    to: { name: "Home", hash: "#pricing" },
  },
  { label: "Download", icon: "pi pi-download", to: { name: "Download" } },

  {
    label: "Documentation",
    icon: "pi pi-question-circle",
    to: "//docs.pipelab.app",
    external: true,
    disabled: false,
  },
  {
    label: "Github",
    icon: SimpleIconsGithub,
    to: "//github.com/CynToolkit/pipelab",
    external: true,
    disabled: false,
    iconOnly: true,
  },
  {
    label: "X",
    icon: SimpleIconsX,
    to: "//x.com/pipelabapp",
    external: true,
    disabled: false,
    iconOnly: true,
  },
  {
    label: "Mastodon",
    icon: SimpleIconsMastodon,
    to: "//mastodon.gamedev.place/@pipelab",
    external: true,
    disabled: false,
    iconOnly: true,
  },
  {
    label: "Bluesky",
    icon: SimpleIconsBluesky,
    to: "//bsky.app/profile/pipelab.bsky.social",
    external: true,
    disabled: false,
    iconOnly: true,
  },
  {
    label: "Discord",
    icon: SimpleIconsDiscord,
    to: "//discord.gg/MzNw26cBb5",
    external: true,
    disabled: false,
    iconOnly: true,
  },

  {
    label: "Contact",
    icon: SimpleIconsGmail,
    to: "mailto:contact@pipelab.app",
    external: true,
    disabled: false,
    iconOnly: true,
  },
]);

const mobileMenuOpen = ref(false);

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};
</script>

<style lang="scss" scoped>
.primary-btn {
  text-decoration: none;
}

.primary-btn:not(.p-button-outlined) {
  background: var(--primary-color) !important;
  border-color: var(--primary-color) !important;
  color: white !important;
}

.primary-btn.p-button-outlined {
  color: var(--primary-color);
  border-color: var(--primary-color);

  &:hover {
    color: var(--primary-color) !important;
    border-color: var(--primary-color) !important;
    background: var(--primary-color_hover) !important;
  }
}

.header {
  background-color: var(--surface-card);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 1000;
}
.container {
  max-width: 1300px;
  margin: 0 auto;
  padding: 0 1rem;

  @media (min-width: 640px) {
    padding: 0 2rem;
  }
}
.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--primary-color);
}

.nav-link-logo {
  color: var(--text-color);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s ease;
  &:hover {
    color: var(--primary-color);
  }
}

.nav-link {
  color: var(--text-color);
  text-decoration: none;
  margin-left: 1.5rem;
  font-weight: 500;
  transition: color 0.3s ease;
  cursor: pointer;

  &:hover {
    color: var(--primary-color);
  }
  i {
    margin-right: 0.5rem;
  }
}

.icon-only {
  margin-left: 2rem;
}

.icon-only ~ .icon-only {
  margin-left: 0.5rem;
}

.mobile-menu {
  background-color: var(--surface-card);
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  z-index: 999;
  padding: 1rem;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}
.mobile-nav-link {
  display: block;
  color: var(--text-color);
  text-decoration: none;
  padding: 0.75rem 0;
  font-weight: 500;
  transition: color 0.3s ease;
  &:hover {
    color: var(--primary-color);
  }
  i {
    margin-right: 0.5rem;
  }
}

a[disabled="true"] {
  color: #666;
  pointer-events: none;
}

.main-content {
  min-height: 60vh;
}

.footer {
  background-color: var(--surface-section);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  padding: 2rem 0;
  color: var(--text-color);
}

.footer-title {
  font-weight: 700;
  color: var(--text-color);
  text-transform: uppercase;
  font-size: 0.875rem;
  letter-spacing: 0.05em;
}

.footer-link {
  color: var(--text-color);
  text-decoration: none;
  font-size: 0.95rem;
  transition: color 0.2s ease;
  opacity: 0.8;

  &:hover {
    color: var(--primary-color);
    opacity: 1;
  }
}

.footer-brand {
  p {
    margin: 0;
    line-height: 1.5;
  }
}
</style>

<style lang="scss">
/* @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap");

body {
  font-family: "Inter", sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
  color: var(--text-color);
  margin: 0;
} */

:root {
  --primary-color: #4f46e5;
  --primary-color_hover: #4f46e51a;
  --surface-ground: #f9fafb;
  --surface-section: #ffffff;
  --text-color: #1f2937;
  --surface-card: #ffffff;
}
</style>
