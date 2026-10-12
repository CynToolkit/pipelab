<template>
  <div>
    <a class="skip-link" href="#main-content">Skip to content</a>
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
          <nav class="hidden lg:flex" aria-label="Primary navigation">
            <RouterLink
              v-for="item in menuItems"
              :key="item.label"
              :to="item.to"
              class="nav-link"
            >
              <span>{{ item.label }}</span>
            </RouterLink>
            <a
              v-for="item in resourceItems"
              :key="item.label"
              :href="item.href"
              class="nav-link"
              >{{ item.label }}</a
            >
          </nav>
          <Button
            id="mobile-menu-toggle"
            icon="pi pi-bars"
            :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
            :aria-expanded="mobileMenuOpen"
            aria-controls="mobile-navigation"
            @click="toggleMobileMenu"
            @keydown.esc="closeMobileMenuOnEscape"
            class="primary-btn lg:hidden"
          />
        </div>
      </div>
    </header>
    <nav
      v-show="mobileMenuOpen"
      id="mobile-navigation"
      class="mobile-menu lg:hidden"
      aria-label="Mobile navigation"
      @keydown.esc="closeMobileMenuOnEscape"
    >
      <RouterLink
        v-for="item in menuItems"
        :key="item.label"
        :to="item.to"
        class="mobile-nav-link"
        @click="closeMobileMenu"
      >
        <i :class="item.icon" aria-hidden="true"></i>
        {{ item.label }}
      </RouterLink>
      <a
        v-for="item in resourceItems"
        :key="item.label"
        :href="item.href"
        class="mobile-nav-link"
        @click="closeMobileMenu"
        >{{ item.label }}</a
      >
    </nav>
    <main id="main-content" class="main-content">
      <RouterView></RouterView>
    </main>
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand-column">
            <div class="footer-brand">
              <img height="32" src="/banner.png" alt="Pipelab" />
              <p class="text-sm opacity-70">
                Turn your game project into a build you can share.
              </p>
              <p class="text-sm opacity-50 mt-4">
                © 2026 Pipelab. All rights reserved.
              </p>
            </div>
          </div>
          <div>
            <h4 class="footer-title">Legal</h4>
            <ul class="list-none p-0 m-0">
              <li>
                <RouterLink :to="{ name: 'Privacy' }" class="footer-link"
                  >Privacy Policy</RouterLink
                >
              </li>
              <li>
                <RouterLink :to="{ name: 'Terms' }" class="footer-link"
                  >Terms of Service</RouterLink
                >
              </li>
            </ul>
          </div>
          <div>
            <h4 class="footer-title">Support</h4>
            <ul class="list-none p-0 m-0">
              <li>
                <a href="mailto:contact@pipelab.app" class="footer-link"
                  >Contact Us</a
                >
              </li>
              <li>
                <a href="https://docs.pipelab.app" class="footer-link">Docs</a>
              </li>
              <li>
                <a
                  href="https://github.com/CynToolkit/pipelab"
                  class="footer-link"
                  >GitHub</a
                >
              </li>
              <li>
                <a
                  href="//discord.gg/MzNw26cBb5"
                  target="_blank"
                  rel="noopener"
                  class="footer-link"
                  >Community Discord</a
                >
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

const menuItems = ref([
  {
    label: "Product",
    icon: "pi pi-desktop",
    to: { name: "Home", hash: "#product" },
  },
  {
    label: "Workflows",
    icon: "pi pi-list",
    to: { name: "Home", hash: "#workflows" },
  },
  { label: "Download", icon: "pi pi-download", to: { name: "Download" } },
]);
const resourceItems = [
  { label: "Docs", href: "https://docs.pipelab.app" },
  { label: "GitHub", href: "https://github.com/CynToolkit/pipelab" },
  { label: "Contact", href: "mailto:contact@pipelab.app" },
  { label: "Discord", href: "https://discord.gg/MzNw26cBb5" },
];

const mobileMenuOpen = ref(false);

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};

const closeMobileMenuOnEscape = () => {
  closeMobileMenu();
  document.getElementById("mobile-menu-toggle")?.focus();
};
</script>

<style lang="scss" scoped>
.primary-btn {
  text-decoration: none;
}
.skip-link {
  position: fixed;
  top: -60px;
  left: 12px;
  z-index: 2000;
  padding: 12px;
  background: #fff;
  color: #3324ca;
}
.skip-link:focus {
  top: 12px;
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
  margin-left: 1.25rem;
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
@media (max-width: 1150px) {
  .nav-link {
    margin-left: 0.8rem;
    font-size: 0.9rem;
  }
}
.nav-link:focus-visible,
.mobile-nav-link:focus-visible,
.footer-link:focus-visible,
.nav-link-logo:focus-visible {
  outline: 3px solid #4b3cf2;
  outline-offset: 3px;
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
  top: 85px;
  left: 0;
  right: 0;
  z-index: 999;
  padding: 1rem;
  max-height: calc(100dvh - 85px);
  overflow-y: auto;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}
.mobile-nav-link {
  display: block;
  min-height: 44px;
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
  color: var(--text-color);
}
.footer-grid {
  display: grid;
  grid-template-columns: 1.5fr 0.8fr 0.8fr;
  gap: 32px;
  padding: 28px 0;
}

.footer-title {
  font-weight: 700;
  color: var(--text-color);
  text-transform: uppercase;
  font-size: 0.875rem;
  letter-spacing: 0.05em;
  margin: 0 0 8px;
}

.footer-link {
  color: var(--text-color);
  display: inline-flex;
  align-items: center;
  min-height: 32px;
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
  img {
    margin-bottom: 10px;
  }
  p {
    margin: 0;
    line-height: 1.5;
  }
  p + p {
    margin-top: 12px;
  }
}
@media (max-width: 700px) {
  .footer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px;
  }
  .footer-brand-column {
    grid-column: 1 / -1;
  }
  .footer-link {
    min-height: 44px;
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
body {
  margin: 0;
}
@media (max-width: 1023px) {
  .header .primary-btn {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
