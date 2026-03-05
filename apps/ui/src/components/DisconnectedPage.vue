<template>
  <div class="disconnected-page">
    <!-- Grid background -->
    <div class="grid-background"></div>

    <div class="page-content">
      <div class="center-content">
        <div class="status-badge">
          <span class="status-dot"></span>
          Offline
        </div>
        
        <div class="icon-container">
          <i class="pi pi-wifi text-8xl icon-pulse"></i>
          <div class="connection-lines">
            <div class="line line-1"></div>
            <div class="line line-2"></div>
            <div class="line line-3"></div>
          </div>
        </div>

        <h1 class="title">Connection Lost</h1>
        <p class="subtitle">
          We couldn't establish a connection to the Pipelab agent.<br />
          Please ensure the agent is running and try again.
        </p>
        
        <div class="actions">
          <Button 
            label="Try Reconnect" 
            icon="pi pi-refresh" 
            @click="testReconnection" 
            :loading="isReconnecting"
            class="reconnect-button"
          />
        </div>
      </div>
    </div>

    <!-- Fancy background elements -->
    <div class="background-elements">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <!-- Bottom info bar -->
    <div class="bottom-bar">
      <div class="agent-info" v-if="agentsStore.selectedAgent">
        Target: {{ agentsStore.selectedAgent.url }}
      </div>
      <div class="retry-count" v-if="retryCount > 0">
        Attempts: {{ retryCount }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import { websocketManager } from '@renderer/composables/websocket-manager'
import { useAgentsStore } from '@renderer/store/agents'

const isReconnecting = ref(false)
const retryCount = ref(0)
const agentsStore = useAgentsStore()

const testReconnection = async () => {
  isReconnecting.value = true
  retryCount.value++
  try {
    if (agentsStore.selectedAgent) {
      await websocketManager.connect(agentsStore.selectedAgent.url)
    } else {
      await websocketManager.connect()
    }
  } catch (e) {
    console.error('Reconnection failed', e)
  } finally {
    // Keep it loading for a short while
    setTimeout(() => {
      isReconnecting.value = false
    }, 800)
  }
}
</script>

<style scoped lang="scss">
.disconnected-page {
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
  z-index: 9999;
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
  width: 100%;
}

.center-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 800px;
  width: 100%;
  padding: 2rem;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  background: var(--p-surface-0);
  border-radius: 2rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin-bottom: 3rem;
  border: 1px solid var(--p-surface-200);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.status-dot {
  width: 10px;
  height: 10px;
  background: var(--p-red-500);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--p-red-500);
}

.icon-container {
  position: relative;
  margin-bottom: 3rem;
}

.icon-pulse {
  color: var(--p-red-500);
  filter: drop-shadow(0 0 20px rgba(var(--p-red-500-rgb), 0.3));
  animation: pulse 2.5s infinite ease-in-out;
}

.connection-lines {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 150%;
  height: 150%;
  pointer-events: none;
}

.line {
  position: absolute;
  border: 2px solid var(--p-red-200);
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
}

.line-1 { width: 120px; height: 120px; animation: expand 4s infinite 0s; }
.line-2 { width: 120px; height: 120px; animation: expand 4s infinite 1.3s; }
.line-3 { width: 120px; height: 120px; animation: expand 4s infinite 2.6s; }

.title {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  font-weight: 800;
  color: var(--p-text-color);
  letter-spacing: -0.03em;
  line-height: 1;
}

.subtitle {
  font-size: 1.5rem;
  line-height: 1.5;
  margin-bottom: 4rem;
  color: var(--p-text-muted-color);
  max-width: 500px;
}

.reconnect-button {
  padding: 1.25rem 3.5rem !important;
  font-size: 1.25rem !important;
  font-weight: 700 !important;
  border-radius: 1.25rem !important;
  box-shadow: 0 15px 35px rgba(var(--p-primary-color-rgb), 0.25) !important;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;

  &:hover {
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 20px 45px rgba(var(--p-primary-color-rgb), 0.35) !important;
  }
  
  &:active {
    transform: translateY(-2px) scale(0.98);
  }
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
  filter: blur(100px);
  opacity: 0.12;
}

.blob-1 {
  width: 800px;
  height: 800px;
  top: -300px;
  left: -200px;
  background: var(--p-primary-color);
  animation: drift 30s infinite alternate;
}

.blob-2 {
  width: 700px;
  height: 700px;
  bottom: -200px;
  right: -100px;
  background: var(--p-red-500);
  animation: drift 35s infinite alternate-reverse;
}

.blob-3 {
  width: 600px;
  height: 600px;
  top: 30%;
  right: 15%;
  background: var(--p-blue-500);
  animation: drift 25s infinite alternate;
}

.bottom-bar {
  padding: 2rem 4rem;
  width: 100%;
  display: flex;
  justify-content: space-between;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  z-index: 5;
  background: linear-gradient(to top, var(--p-surface-ground), transparent);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes expand {
  0% { width: 100px; height: 100px; opacity: 0.6; border-width: 3px; }
  100% { width: 500px; height: 500px; opacity: 0; border-width: 0.5px; }
}

@keyframes drift {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(150px, 100px) rotate(15deg); }
}

@media (max-width: 992px) {
  .title {
    font-size: 3rem;
  }
  .subtitle {
    font-size: 1.25rem;
  }
}

@media (max-width: 576px) {
  .title {
    font-size: 2.5rem;
  }
  .bottom-bar {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
  }
}
</style>
