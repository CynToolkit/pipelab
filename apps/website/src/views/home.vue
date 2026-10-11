<script setup lang="ts">
import ExampleWizard from "@/components/ExampleWizard.vue";
// @ts-ignore - generated Iconify modules do not have TypeScript declarations
import ConstructIcon from "~icons/simple-icons/construct3";
// @ts-ignore - generated Iconify modules do not have TypeScript declarations
import ElectronIcon from "~icons/simple-icons/electron";
// @ts-ignore - generated Iconify modules do not have TypeScript declarations
import TauriIcon from "~icons/simple-icons/tauri";
// @ts-ignore - generated Iconify modules do not have TypeScript declarations
import SteamIcon from "~icons/simple-icons/steam";
// @ts-ignore - generated Iconify modules do not have TypeScript declarations
import ItchIcon from "~icons/simple-icons/itchdotio";
const journey = [
  {
    title: "Choose game",
    copy: "Pick your game project or files.",
    icon: "pi pi-folder",
  },
  { title: "Build", copy: "Choose how to build your game.", icon: "pi pi-box" },
  {
    title: "Choose stores",
    copy: "Choose where you want to publish.",
    icon: "pi pi-send",
  },
  {
    title: "Publish",
    copy: "Review everything, then start your release.",
    icon: "pi pi-sparkles",
  },
];
const tools = [
  { label: "Construct 3", icon: ConstructIcon },
  { label: "Game files", icon: null },
  { label: "Electron", icon: ElectronIcon },
  { label: "Tauri", icon: TauriIcon },
  { label: "Steam", icon: SteamIcon },
  { label: "itch.io", icon: ItchIcon },
];
</script>
<template>
  <div class="landing">
    <section id="product" class="hero-section">
      <div class="landing-container hero-layout">
        <div class="hero-copy">
          <p class="eyebrow">Built for indie developers</p>
          <h1>A simple way <span>to ship your game.</span></h1>
          <p class="lead">
            Pipelab helps you turn your game project into a build you can
            publish on Steam and itch.io.
          </p>
          <RouterLink class="landing-button" :to="{ name: 'Download' }"
            ><i class="pi pi-download" aria-hidden="true" /> Download
            Pipelab</RouterLink
          >
          <p class="platforms">Available for Windows, macOS, and Linux</p>
        </div>
        <ExampleWizard />
      </div>
    </section>
    <section id="how-it-works" class="journey-section landing-container">
      <div class="section-heading">
        <h2>Four steps. From project to players.</h2>
        <p>
          Pipelab handles the tricky setup, so you can focus on making your
          game.
        </p>
      </div>
      <ol class="journey-list">
        <li v-for="(item, index) in journey" :key="item.title">
          <span class="journey-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <div class="journey-icon">
            <i :class="item.icon" aria-hidden="true" />
          </div>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.copy }}</p>
          </div>
        </li>
      </ol>
    </section>
    <section class="editorial-section">
      <div class="landing-container editorial-layout">
        <div class="editorial-copy">
          <h2>Set it up once.<br />Release again.</h2>
          <p>
            Keep your game, build settings and stores together. Next time,
            you’re ready to go.
          </p>
        </div>
        <div
          class="product-window"
          aria-label="Illustrative saved workflows list"
        >
          <div class="window-top">
            <span class="window-dots" aria-hidden="true">● ● ●</span
            ><img
              class="window-logo"
              src="/banner.png"
              alt="Pipelab"
              width="82"
              height="21"
            />
          </div>
          <div class="window-body">
            <aside>
              <strong>Workflows</strong><span>Runs</span><span>Settings</span>
            </aside>
            <div class="window-main">
              <h3>Saved workflows</h3>
              <div class="workflow-row">
                <span class="workflow-avatar">G</span>
                <div>
                  <strong>Example game</strong
                  ><small>Project · build settings · stores</small>
                </div>
                <span class="workflow-action">Edit</span
                ><span class="workflow-action">View runs</span>
              </div>
              <div class="workflow-row">
                <span class="workflow-avatar second">A</span>
                <div>
                  <strong>Another project</strong
                  ><small>Project · build settings · stores</small>
                </div>
                <span class="workflow-action">Edit</span
                ><span class="workflow-action">View runs</span>
              </div>
              <p class="illustration-note">Illustrative product view</p>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="integrations-section">
      <div class="landing-container">
        <div class="section-heading">
          <h2>Works with the tools you use.</h2>
          <p>Build with Electron or Tauri. Publish to Steam and itch.io.</p>
        </div>
        <ul class="tool-list">
          <li v-for="tool in tools" :key="tool.label">
            <span class="tool-mark"
              ><component
                :is="tool.icon"
                v-if="tool.icon"
                aria-hidden="true" /><i
                v-else
                class="pi pi-folder"
                aria-hidden="true" /></span
            >{{ tool.label }}
          </li>
        </ul>
      </div>
    </section>
    <section class="editorial-section results-section">
      <div class="landing-container editorial-layout reverse">
        <div
          class="product-window"
          aria-label="Illustrative release run details"
        >
          <div class="window-top">
            <span class="window-dots" aria-hidden="true">● ● ●</span
            ><img
              class="window-logo"
              src="/banner.png"
              alt="Pipelab"
              width="82"
              height="21"
            />
          </div>
          <div class="window-body">
            <aside>
              <span>Workflows</span><strong>Runs</strong><span>Settings</span>
            </aside>
            <div class="window-main">
              <h3>Example run details</h3>
              <div class="run-row">
                <span class="status good">✓</span>
                <div>
                  <strong>Build for desktop</strong
                  ><small>Completed · example</small>
                </div>
                <span class="run-state">Done</span>
              </div>
              <div class="run-row">
                <span class="status good">✓</span>
                <div>
                  <strong>Upload to itch.io</strong
                  ><small>Completed · example</small>
                </div>
                <span class="run-state">Done</span>
              </div>
              <div class="run-row">
                <span class="status needs">!</span>
                <div>
                  <strong>Upload to Steam</strong
                  ><small>Needs attention · example</small>
                </div>
                <span class="run-state needs-text">Review</span>
              </div>
              <p class="illustration-note">
                Illustrative product view; no release was run
              </p>
            </div>
          </div>
        </div>
        <div class="editorial-copy">
          <h2>See how your release went.</h2>
          <p>
            Check what worked, what needs fixing, and where your files went.
          </p>
        </div>
      </div>
    </section>
    <section class="final-cta">
      <div class="landing-container">
        <h2>Ready to share your game?</h2>
        <p>Start with your first release.</p>
        <RouterLink class="landing-button" :to="{ name: 'Download' }"
          ><i class="pi pi-download" aria-hidden="true" /> Download
          Pipelab</RouterLink
        >
      </div>
    </section>
  </div>
</template>
<style scoped src="./home.css"></style>
