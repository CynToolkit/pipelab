<template>
  <div class="splash" :class="{ 'light-theme': theme === 'light' }">
    <!-- Ambient glow orbs -->
    <div class="ambient" aria-hidden="true">
      <div class="orb orb-1" />
      <div class="orb orb-2" />
      <div class="orb orb-3" />
    </div>

    <!-- Subtle grid -->
    <div class="grid-overlay" aria-hidden="true" />

    <!-- Main centered content — NO card box -->
    <div class="center">
      <!-- Logo -->
      <div class="logo-wrap">
        <img src="/icon.png" alt="Pipelab" class="logo" />
      </div>

      <!-- Wordmark -->
      <h1 class="app-name">Pipelab</h1>

      <!-- Version badge (shows once fetched) -->
      <transition name="fade-up">
        <span v-if="version" class="version-badge">{{ version }}</span>
      </transition>

      <!-- Thin progress shimmer -->
      <div class="progress-track">
        <div class="progress-fill" />
      </div>

      <!-- Rolling step log -->
      <div class="steps" aria-live="polite">
        <transition name="step" mode="out-in">
          <div :key="currentStep.id" class="step">
            <i class="step-icon mdi mdi-loading mdi-spin" />
            <span>{{ currentStep.message }}</span>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useWebSocketAPI } from "../composables/websocket-client";
import { useAPI } from "../composables/api";
import { useAppSettings } from "../store/settings";

const { on } = useWebSocketAPI();
const api = useAPI();
const settingsStore = useAppSettings();

interface Step {
  id: number;
  message: string;
}

let stepCounter = 0;
const currentStep = ref<Step>({ id: stepCounter++, message: "Initialising environment…" });
const version = ref<string | null>(null);

const theme = computed(() => settingsStore.settings.theme);

let unbind: (() => void) | undefined;

onMounted(async () => {
  try {
    const res = await api.execute("agent:version:get");
    if (res.type === "success") version.value = `v${res.result.version}`;
  } catch {
    /* stays null */
  }

  unbind = on("startup:progress", (event: any) => {
    if (event.type === "progress") {
      currentStep.value = { id: stepCounter++, message: event.data.message };
    }
  });
});

onUnmounted(() => unbind?.());

const isElectron = computed(
  () =>
    (typeof window !== "undefined" && (window as any).process?.type === "renderer") ||
    navigator.userAgent.toLowerCase().includes(" electron/"),
);
</script>

<style scoped lang="scss">
/* ─── Root ─────────────────────────────────────────────── */
.splash {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0d0d14;
  color: #fff;
  font-family: var(--font-family, "Geist", system-ui, sans-serif);
  overflow: hidden;
  z-index: 10000;
  transition:
    background-color 0.5s ease,
    color 0.5s ease;

  &.light-theme {
    background: #f8fafc;
    color: #0f172a;
  }
}

/* ─── Ambient orbs ──────────────────────────────────────── */
.ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(130px);
  transition: background 0.5s ease;
}

.orb-1 {
  width: 55vw;
  height: 55vw;
  top: -20%;
  left: -15%;
  background: radial-gradient(circle, #5b52f440 0%, transparent 70%);
  animation: drift 22s ease-in-out infinite alternate;

  .light-theme & {
    background: radial-gradient(circle, #5b52f415 0%, transparent 70%);
  }
}

.orb-2 {
  width: 45vw;
  height: 45vw;
  bottom: -15%;
  right: -10%;
  background: radial-gradient(circle, #3b82f630 0%, transparent 70%);
  animation: drift 28s ease-in-out infinite alternate-reverse;

  .light-theme & {
    background: radial-gradient(circle, #3b82f612 0%, transparent 70%);
  }
}

.orb-3 {
  width: 30vw;
  height: 30vw;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, #7c3aed20 0%, transparent 70%);
  animation: drift 18s ease-in-out infinite alternate;

  .light-theme & {
    background: radial-gradient(circle, #7c3aed0a 0%, transparent 70%);
  }
}

/* ─── Grid ──────────────────────────────────────────────── */
.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 52px 52px;
  pointer-events: none;
  transition: background-image 0.5s ease;

  .light-theme & {
    background-image:
      linear-gradient(rgba(15, 23, 42, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(15, 23, 42, 0.03) 1px, transparent 1px);
  }
}

/* ─── Center content ────────────────────────────────────── */
.center {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
}

/* ─── Logo ──────────────────────────────────────────────── */
.logo-wrap {
  width: 80px;
  height: 80px;
  border-radius: 22px;
  background: rgba(91, 82, 244, 0.12);
  border: 1px solid rgba(91, 82, 244, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 40px rgba(91, 82, 244, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  margin-bottom: 0.4rem;
  transition: all 0.5s ease;

  .light-theme & {
    background: rgba(91, 82, 244, 0.06);
    border: 1px solid rgba(91, 82, 244, 0.16);
    box-shadow:
      0 4px 20px rgba(91, 82, 244, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }
}

.logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
}

/* ─── Wordmark ──────────────────────────────────────────── */
.app-name {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(145deg, #fff 20%, rgba(255, 255, 255, 0.45) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
  transition: background 0.5s ease;

  .light-theme & {
    background: linear-gradient(145deg, #0f172a 20%, #64748b 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

/* ─── Version badge ─────────────────────────────────────── */
.version-badge {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  padding: 0.18rem 0.7rem;
  border-radius: 99px;
  transition: all 0.5s ease;

  .light-theme & {
    color: rgba(15, 23, 42, 0.5);
    background: rgba(15, 23, 42, 0.04);
    border: 1px solid rgba(15, 23, 42, 0.08);
  }
}

/* ─── Progress shimmer ──────────────────────────────────── */
.progress-track {
  width: clamp(180px, 24vw, 320px);
  height: 2px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 99px;
  overflow: hidden;
  margin: 0.4rem 0;
  transition: background 0.5s ease;

  .light-theme & {
    background: rgba(15, 23, 42, 0.06);
  }
}

.progress-fill {
  width: 45%;
  height: 100%;
  background: linear-gradient(90deg, transparent, #7c6af7, transparent);
  border-radius: 99px;
  animation: shimmer 1.8s ease-in-out infinite;
  transition: background 0.5s ease;

  .light-theme & {
    background: linear-gradient(90deg, transparent, #5b52f4, transparent);
  }
}

/* ─── Steps ─────────────────────────────────────────────── */
.steps {
  min-height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  font-size: 0.78rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.88);
  transition: color 0.3s ease;

  .light-theme & {
    color: rgba(15, 23, 42, 0.7);
  }
}

.step-icon {
  flex-shrink: 0;
  font-size: 0.8rem;
  width: 14px;
  text-align: center;
  color: #7c6af7;

  .light-theme & {
    color: #5b52f4;
  }
}

/* ─── Transitions ────────────────────────────────────────── */
.step-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.step-leave-active {
  transition: all 0.2s ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.step-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.fade-up-enter-active {
  transition: all 0.4s ease;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

/* ─── Keyframes ──────────────────────────────────────────── */
@keyframes drift {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(6vw, 4vh);
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-250%);
  }
  100% {
    transform: translateX(500%);
  }
}
</style>
