<template>
  <div v-if="isDevMode" class="dev-benefits-override" :class="{ collapsed: isCollapsed }">
    <div class="dev-panel">
      <div class="panel-header">
        <h4 v-if="!isCollapsed">Dev Benefits Override</h4>
        <span v-else class="collapsed-title">Dev Tools</span>
        <button class="toggle-btn" @click="toggleCollapse">
          <i class="mdi" :class="isCollapsed ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
        </button>
      </div>

      <div v-if="!isCollapsed">
        <div v-for="benefit in benefits" :key="benefit.key" class="benefit-item">
          <div class="benefit-header">
            <span class="benefit-label">{{ benefit.label }}</span>
            <select
              :value="auth.devOverrides[benefit.key] || 'actual'"
              class="override-select"
              @change="setOverride(benefit.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="actual">Use Actual</option>
              <option value="force-on">Force On</option>
              <option value="force-off">Force Off</option>
            </select>
          </div>
          <div class="status-container">
            <span class="status actual" :class="{ active: actualStatus[benefit.key] }">
              Actual: {{ actualStatus[benefit.key] ? 'Active' : 'Inactive' }}
            </span>
            <span class="status effective" :class="{ active: effectiveStatus[benefit.key] }">
              Effective: {{ effectiveStatus[benefit.key] ? 'Active' : 'Inactive' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '../store/auth'

const auth = useAuth()
const isCollapsed = ref(true)

const benefits = [
  { key: 'build-history', label: 'Build History' },
  { key: 'cloud-save', label: 'Cloud Save' },
  { key: 'multiple-projects', label: 'Multiple Projects' }
] as const

const isDevMode = computed(() => process.env.NODE_ENV === 'development')

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const actualStatus = computed(() => ({
  'build-history': auth.getActualBenefit('build-history'),
  'cloud-save': auth.getActualBenefit('cloud-save'),
  'multiple-projects': auth.getActualBenefit('multiple-projects')
}))

const effectiveStatus = computed(() => ({
  'build-history': auth.hasBenefit('build-history'),
  'cloud-save': auth.hasBenefit('cloud-save'),
  'multiple-projects': auth.hasBenefit('multiple-projects')
}))

const setOverride = (benefit: string, value: string) => {
  console.log(`[DevBenefitsOverride] Setting override for ${benefit} to ${value}`)
  auth.setDevOverride(benefit, value)
}
</script>

<style scoped>
.dev-benefits-override {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}

.dev-panel {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 16px;
  border-radius: 8px;
  min-width: 300px;
  font-size: 14px;
  transition: all 0.3s ease;
}

.dev-benefits-override.collapsed .dev-panel {
  min-width: auto;
  padding: 8px 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.dev-benefits-override.collapsed .panel-header {
  margin-bottom: 0;
}

.panel-header h4 {
  margin: 0;
  font-size: 16px;
}

.collapsed-title {
  font-weight: bold;
  margin-right: 8px;
}

.toggle-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.benefit-item {
  margin-bottom: 12px;
}

.benefit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.benefit-label {
  font-weight: 500;
}

.override-select {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
}

.override-select:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
}

.status-container {
  display: flex;
  gap: 8px;
}

.status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.status.active {
  background: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.status.actual {
  opacity: 0.8;
}
</style>
