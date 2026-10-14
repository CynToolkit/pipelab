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
            Pipelab helps you turn your game project into a build you can publish on Steam and
            itch.io.
          </p>
          <RouterLink class="landing-button" :to="{ name: 'Download' }"
            ><i class="pi pi-download" aria-hidden="true" /> Download Pipelab</RouterLink
          >
          <RouterLink class="construct-link" :to="{ name: 'Construct3' }">
            Using Construct 3? See how it works
            <i class="pi pi-arrow-right" aria-hidden="true" />
          </RouterLink>
          <p class="platforms">Available for Windows, macOS, and Linux</p>
        </div>
        <ExampleWizard />
      </div>
    </section>
    <section id="how-it-works" class="journey-section">
      <div class="landing-container">
        <div class="section-heading journey-heading">
          <p class="eyebrow">How it works</p>
          <h2>From project to players.</h2>
          <p>Pipelab handles the tricky setup, so you can focus on making your game.</p>
        </div>
        <ol class="journey-steps">
          <li>
            <span class="journey-number" aria-hidden="true">1</span>
            <h3>Choose game</h3>
            <p>Pick your game project or files.</p>
          </li>
          <li>
            <span class="journey-number" aria-hidden="true">2</span>
            <h3>Build</h3>
            <p>Choose how to build your game.</p>
          </li>
          <li>
            <span class="journey-number" aria-hidden="true">3</span>
            <h3>Choose stores</h3>
            <p>Choose where you want to publish.</p>
          </li>
          <li>
            <span class="journey-number" aria-hidden="true">4</span>
            <h3>Publish</h3>
            <p>Review everything, then start your release.</p>
          </li>
        </ol>
      </div>
    </section>
    <section id="workflows" class="editorial-section">
      <div class="landing-container editorial-layout">
        <div class="editorial-copy">
          <p class="eyebrow">Made for the next update</p>
          <h2>Set it up once. Release again.</h2>
          <p>Keep your game, build settings and stores together. Next time, you’re ready to go.</p>
        </div>
        <figure
          class="workflow-map"
          aria-label="Example workflow: one Construct game produces a desktop build for Steam and a web export for itch.io"
        >
          <figcaption>One game. One workflow. <span>Example workflow</span></figcaption>
          <div class="map-source">
            <ConstructIcon aria-hidden="true" />
            <div><strong>My game</strong><span>Construct project</span></div>
            <span class="map-tag">Source</span>
          </div>
          <div class="map-routes">
            <div class="map-route">
              <div class="map-build">
                <ElectronIcon aria-hidden="true" /><span>Desktop build</span>
              </div>
              <i class="pi pi-arrow-right" aria-hidden="true" />
              <div class="map-destination">
                <SteamIcon aria-hidden="true" /><strong>Steam</strong>
              </div>
            </div>
            <div class="map-route">
              <div class="map-build">
                <i class="pi pi-globe" aria-hidden="true" /><span>Web export</span>
              </div>
              <i class="pi pi-arrow-right" aria-hidden="true" />
              <div class="map-destination">
                <ItchIcon aria-hidden="true" /><strong>itch.io</strong>
              </div>
            </div>
          </div>
          <p class="map-caption">
            <i class="pi pi-refresh" aria-hidden="true" /> New update. Same workflow.
          </p>
          <div class="saved-workflows">
            <div class="saved-workflows-heading">
              <strong>Saved workflows</strong>
              <span>Example</span>
            </div>
            <ul>
              <li>
                <span><strong>My game</strong><small>Construct 3 · Steam</small></span>
                <span class="saved-workflow-actions" aria-label="Example actions">
                  <span>Edit</span><span>View runs</span>
                </span>
              </li>
            </ul>
          </div>
        </figure>
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
              ><component :is="tool.icon" v-if="tool.icon" aria-hidden="true" /><i
                v-else
                class="pi pi-file"
                aria-hidden="true" /></span
            >{{ tool.label }}
          </li>
        </ul>
      </div>
    </section>
    <section class="editorial-section results-section">
      <div class="landing-container editorial-layout reverse">
        <div class="product-window" aria-label="Illustrative release run details">
          <div class="window-top">
            <img class="window-logo" src="/banner.png" alt="Pipelab" width="82" height="21" />
          </div>
          <div class="window-body">
            <aside><span>Workflows</span><strong>Runs</strong><span>Settings</span></aside>
            <div class="window-main">
              <h3>Example run details</h3>
              <div class="run-row">
                <span class="status good">✓</span>
                <div><strong>Build for desktop</strong><small>Completed · example</small></div>
                <span class="run-state">Done</span>
              </div>
              <div class="run-row">
                <span class="status good">✓</span>
                <div><strong>Upload to itch.io</strong><small>Completed · example</small></div>
                <span class="run-state">Done</span>
              </div>
              <div class="run-row">
                <span class="status needs">!</span>
                <div><strong>Upload to Steam</strong><small>Needs attention · example</small></div>
                <span class="run-state needs-text">Review</span>
              </div>
              <p class="illustration-note">Illustrative product view; no release was run</p>
            </div>
          </div>
        </div>
        <div class="editorial-copy">
          <h2>See how your release went.</h2>
          <p>Check what worked, what needs fixing, and where your files went.</p>
        </div>
      </div>
    </section>
    <section class="final-cta">
      <div class="landing-container">
        <h2>Ready to share your game?</h2>
        <p>Start with your first release.</p>
        <RouterLink class="landing-button" :to="{ name: 'Download' }"
          ><i class="pi pi-download" aria-hidden="true" /> Download Pipelab</RouterLink
        >
      </div>
    </section>
  </div>
</template>
<style scoped src="./home.css"></style>
