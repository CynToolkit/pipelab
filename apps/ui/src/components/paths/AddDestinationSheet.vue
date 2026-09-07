<template>
  <div class="add-backdrop" @click.self="$emit('close')">
    <div class="add-sheet">
      <h3 class="sheet-title">Add destination</h3>
      <div class="platform-grid">
        <button
          v-for="opt in availableOptions"
          :key="opt.value"
          class="platform-option"
          @click="$emit('pick', opt.value)"
        >
          <i class="mdi platform-icon" :class="opt.icon" :style="{ color: opt.color }"></i>
          <span class="platform-name">{{ opt.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DestinationType } from "@pipelab/shared";

const props = defineProps<{ usedTypes: DestinationType[] }>();

defineEmits<{
  (e: "pick", type: DestinationType): void;
  (e: "close"): void;
}>();

const ALL_OPTIONS: { value: DestinationType; name: string; icon: string; color: string }[] = [
  { value: "steam", name: "Steam", icon: "mdi-steam", color: "#1b2838" },
  { value: "itch", name: "Itch.io", icon: "mdi-puzzle", color: "#fa5c5c" },
  { value: "poki", name: "Poki", icon: "mdi-gamepad-variant", color: "#0096ff" },
  { value: "discord-activity", name: "Discord", icon: "mdi-discord", color: "#5865f2" },
  { value: "netlify", name: "Netlify", icon: "mdi-cloud", color: "#00c7b7" },
  { value: "web", name: "Web", icon: "mdi-web", color: "#22c55e" },
  { value: "folder", name: "Folder", icon: "mdi-folder", color: "#8b8b96" },
];

const availableOptions = computed(() =>
  ALL_OPTIONS.filter((o) => !props.usedTypes.includes(o.value)),
);
</script>

<style scoped>
.add-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 1000;
}

.add-sheet {
  background: #18181c;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  padding: 24px;
  width: 480px;
  max-width: 90vw;
}

.sheet-title {
  font-size: 16px;
  font-weight: 500;
  color: #e4e4e7;
  margin: 0 0 16px;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.platform-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 8px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  color: #e4e4e7;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.platform-option:hover {
  background: #2a2a30;
  border-color: #3a3a42;
}

.platform-icon {
  font-size: 24px;
}

.platform-name {
  font-size: 12px;
  color: #e4e4e7;
}

@media (max-width: 640px) {
  .add-backdrop {
    align-items: flex-end;
    padding-top: 0;
  }

  .add-sheet {
    width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  }

  .platform-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .platform-option {
    min-height: 88px;
  }
}
</style>
