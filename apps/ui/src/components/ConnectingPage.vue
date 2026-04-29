<template>
  <div class="connecting-page">
    <div class="grid-background"></div>

    <div class="page-content">
      <div class="center-content">
        <div class="loader-container">
          <div class="loader-circle"></div>
          <div class="loader-logo">
            <i class="mdi mdi-connection text-6xl"></i>
          </div>
        </div>

        <div class="branding">
          <h1 class="title">PIPELAB</h1>
          <div class="loading-bar">
            <div class="loading-progress"></div>
          </div>
          <p class="subtitle">{{ progressMessage }}</p>
        </div>
      </div>
    </div>

    <div class="background-elements">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
    </div>

    <div class="bottom-bar">
      <span class="version-tag">v0.1.0</span>
      <span class="separator">|</span>
      <span class="mode-tag">{{ isElectron ? "Desktop" : "Web" }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted } from "vue";
import { useWebSocketAPI } from "../composables/websocket-client";

const progressMessage = ref("Initialising environment...");
const { on } = useWebSocketAPI();
let unbind: (() => void) | undefined;

onMounted(() => {
  unbind = on("startup:progress", (event) => {
    if (event.type === "progress") {
      progressMessage.value = event.data.message;
    }
  });
});

onUnmounted(() => {
  unbind?.();
});

const isElectron = computed(() => {
  return (
    (typeof window !== "undefined" && (window as any).process?.type === "renderer") ||
    navigator.userAgent.toLowerCase().indexOf(" electron/") > -1
  );
});
</script>

<style scoped lang="scss">
.connecting-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: var(--p-surface-ground);
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  color: var(--p-text-color);
  z-index: 10000;
  font-family: var(--font-family);
}

.grid-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image:
    linear-gradient(var(--p-surface-200) 1px, transparent 1px),
    linear-gradient(90deg, var(--p-surface-200) 1px, transparent 1px);
  background-size: 60px 60px;
  opacity: 0.2;
  pointer-events: none;
}

.page-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.center-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.loader-container {
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loader-circle {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 4px solid var(--p-surface-200);
  border-top: 4px solid var(--p-primary-color);
  border-radius: 50%;
  animation: spin 1.5s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}

.loader-logo {
  color: var(--p-primary-500);
  animation: pulse 2s ease-in-out infinite;
}

.branding {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.title {
  font-size: 4rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  margin: 0;
  background: linear-gradient(135deg, var(--p-text-color) 0%, var(--p-text-muted-color) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
}

.subtitle {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--p-text-muted-color);
  margin: 0;
  opacity: 0.8;
}

.loading-bar {
  width: 240px;
  height: 4px;
  background: var(--p-surface-200);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.loading-progress {
  width: 100%;
  height: 100%;
  background: var(--p-primary-color);
  transform-origin: left;
  animation: progress 2s ease-in-out infinite;
}

.background-elements {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
}

.blob-1 {
  width: 600px;
  height: 600px;
  top: -100px;
  right: -100px;
  background: var(--p-primary-color);
  animation: float 20s infinite alternate;
}

.blob-2 {
  width: 500px;
  height: 500px;
  bottom: -100px;
  left: -100px;
  background: var(--p-blue-500);
  animation: float 25s infinite alternate-reverse;
}

.bottom-bar {
  padding: 2rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--p-text-muted-color);
  opacity: 0.6;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
}

@keyframes progress {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(100%);
  }
}

@keyframes float {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(100px, 50px);
  }
}
</style>
