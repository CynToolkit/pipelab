<template>
  <div class="dest-row" :class="rowClass">
    <!-- Zone 1: Platform -->
    <div class="zone-platform">
      <button class="remove-btn" @click="$emit('remove')" aria-label="Remove destination">
        <i class="mdi mdi-close"></i>
      </button>
      <i class="mdi platform-icon" :class="meta.icon" :style="{ color: meta.color }"></i>
      <div class="platform-text">
        <span class="platform-name">{{ meta.name }}</span>
        <span class="platform-delivery" :class="deliveryTextClass">
          {{ deliveryText }}
        </span>
      </div>
    </div>

    <!-- Zone 2: Center (logs, credentials) -->
    <div class="zone-center">
      <!-- Credentials missing warning -->
      <div v-if="needsCredentials && !hasCredential" class="cred-warning">
        <i class="mdi mdi-key-alert"></i>
        <input
          v-model="credentialInput"
          type="text"
          class="cred-input"
          :placeholder="meta.credentialPlaceholder"
        />
        <button class="cred-save-btn" @click="saveCredential">Save</button>
      </div>

      <!-- Shipping progress -->
      <div v-else-if="state?.state === 'shipping'" class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <span class="log-line">{{ state.lastLog || "Starting…" }}</span>
      </div>

      <!-- Error state -->
      <div v-else-if="state?.state === 'failed'" class="error-logs">
        <span v-for="(line, i) in errorLines" :key="i" class="error-line">{{ line }}</span>
      </div>
    </div>

    <!-- Zone 3: Right (delivery selector + ship) -->
    <div class="zone-right">
      <!-- Delivery selector -->
      <div class="delivery-selector">
        <button
          v-for="opt in validDeliveries"
          :key="opt"
          class="seg"
          :class="{ active: destination.delivery === opt }"
          :disabled="opt !== destination.delivery && !isDeliveryValid(opt)"
          @click="$emit('update-delivery', opt)"
        >
          {{ opt }}
        </button>
      </div>

      <!-- Ship button -->
      <button
        v-if="state?.state === 'failed'"
        class="ship-btn retry"
        @click="$emit('retry')"
      >
        <i class="mdi mdi-refresh"></i>
        Retry
      </button>
      <button
        v-else-if="state?.state === 'shipping'"
        class="ship-btn shipping"
        disabled
      >
        <i class="mdi mdi-loading mdi-spin"></i>
        Shipping…
      </button>
      <button
        v-else-if="state?.state === 'skipped'"
        class="ship-btn resume"
        @click="$emit('ship')"
      >
        Resume
      </button>
      <button
        v-else-if="state?.state === 'shipped'"
        class="ship-btn shipped"
        @click="$emit('ship')"
      >
        Shipped {{ shippedAgo }}
      </button>
      <button
        v-else-if="needsCredentials && !hasCredential"
        class="ship-btn muted"
        disabled
      >
        Set up credentials
      </button>
      <button
        v-else
        class="ship-btn primary"
        :disabled="!isReadyToShip"
        @click="$emit('ship')"
      >
        Ship
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Destination, DeliveryKind, DestinationRun } from "@pipelab/shared";

const props = defineProps<{
  destination: Destination;
  state?: DestinationRun;
  credentialSaving: boolean;
}>();

const emit = defineEmits<{
  (e: "update-delivery", d: DeliveryKind): void;
  (e: "remove"): void;
  (e: "ship"): void;
  (e: "retry"): void;
  (e: "skip"): void;
  (e: "save-credential", credentialId: string): void;
}>();

const credentialInput = ref("");

const DEST_META: Record<string, { name: string; icon: string; color: string; credentialPlaceholder: string }> = {
  steam: { name: "Steam", icon: "mdi-steam", color: "#1b2838", credentialPlaceholder: "Steam API key" },
  itch: { name: "Itch.io", icon: "mdi-puzzle", color: "#fa5c5c", credentialPlaceholder: "Itch API key" },
  poki: { name: "Poki", icon: "mdi-gamepad-variant", color: "#0096ff", credentialPlaceholder: "Poki API key" },
  "discord-activity": { name: "Discord", icon: "mdi-discord", color: "#5865f2", credentialPlaceholder: "Discord App ID" },
  netlify: { name: "Netlify", icon: "mdi-cloud", color: "#00c7b7", credentialPlaceholder: "Netlify token" },
  web: { name: "Web", icon: "mdi-web", color: "#22c55e", credentialPlaceholder: "" },
  folder: { name: "Folder", icon: "mdi-folder", color: "#8b8b96", credentialPlaceholder: "" },
};

const DELIVERY_OPTIONS: Record<string, DeliveryKind[]> = {
  steam: ["app"],
  itch: ["app", "web", "archive"],
  poki: ["web"],
  "discord-activity": ["app"],
  netlify: ["web"],
  web: ["web"],
  folder: ["app", "web", "archive"],
};

const meta = computed(() => DEST_META[props.destination.type] ?? DEST_META.folder);

const validDeliveries = computed<DeliveryKind[]>(
  () => DELIVERY_OPTIONS[props.destination.type] ?? [],
);

const isDeliveryValid = (d: DeliveryKind) => validDeliveries.value.includes(d);

const needsCredentials = computed(() => {
  const t = props.destination.type;
  return t === "steam" || t === "itch" || t === "poki" || t === "discord-activity" || t === "netlify";
});

const hasCredential = computed(() => {
  const c = (props.destination as any).credentialId;
  return typeof c === "string" && c.length > 0;
});

const deliveryText = computed(() => {
  const d = props.destination.delivery;
  return d.charAt(0).toUpperCase() + d.slice(1);
});

const deliveryTextClass = computed(() => {
  if (props.state?.state === "failed") return "failed";
  return "";
});

const rowClass = computed(() => {
  switch (props.state?.state) {
    case "shipping":
      return "shipping";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "shipped":
      return "shipped";
    default:
      return "";
  }
});

const errorLines = computed(() => {
  if (props.state?.error) {
    return props.state.error.split("\n").slice(-3);
  }
  return ["Ship failed"];
});

const shippedAgo = computed(() => {
  if (!props.state?.finishedAt) return "";
  const seconds = Math.floor((Date.now() - props.state.finishedAt) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
});

const isReadyToShip = computed(() => {
  if (props.destination.type === "folder") {
    return !!(props.destination as any).outputDir;
  }
  if (props.destination.type === "web") {
    return !!(props.destination as any).outputDir;
  }
  if (needsCredentials.value) {
    return hasCredential.value;
  }
  return true;
});

const saveCredential = () => {
  if (!credentialInput.value) return;
  emit("save-credential", credentialInput.value);
  credentialInput.value = "";
};
</script>

<style scoped>
.dest-row {
  display: flex;
  align-items: stretch;
  min-height: 72px;
  padding: 12px 16px;
  gap: 16px;
  border-radius: 8px;
  transition: background 0.3s;
  position: relative;
}

.dest-row.shipping {
  background: #1e1e24;
}

.dest-row.failed {
  background: #1e1215;
}

.dest-row.skipped {
  background: #1a1a1e;
}

.dest-row.shipped {
  background: transparent;
}

/* ─── Zone 1: Platform ─────────────────────────────────────────────────── */

.zone-platform {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 200px;
  flex-shrink: 0;
  position: relative;
}

.remove-btn {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #8b8b96;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  z-index: 2;
}

.dest-row:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.remove-btn .mdi {
  font-size: 14px;
}

.platform-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.platform-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.platform-name {
  font-size: 14px;
  font-weight: 500;
  color: #e4e4e7;
  white-space: nowrap;
}

.dest-row.skipped .platform-name {
  color: #8b8b96;
}

.platform-delivery {
  font-size: 11px;
  color: #8b8b96;
  margin-top: 2px;
}

.platform-delivery.failed {
  color: #ef4444;
}

/* ─── Zone 2: Center ───────────────────────────────────────────────────── */

.zone-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  gap: 6px;
}

/* Credentials */

.cred-warning {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cred-warning .mdi {
  color: #f59e0b;
  font-size: 16px;
  flex-shrink: 0;
}

.cred-input {
  flex: 1;
  padding: 6px 10px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 4px;
  color: #e4e4e7;
  font-size: 12px;
  font-family: monospace;
  min-width: 0;
}

.cred-input:focus {
  outline: none;
  border-color: #6366f1;
}

.cred-save-btn {
  padding: 6px 12px;
  background: none;
  border: 1px solid #2a2a30;
  border-radius: 4px;
  color: #8b8b96;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.cred-save-btn:hover {
  color: #e4e4e7;
  border-color: #3a3a42;
}

/* Progress */

.progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-bar {
  height: 4px;
  background: #3a3a42;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #6366f1;
  width: 100%;
  animation: indeterminate 1.4s linear infinite;
  transform-origin: left;
}

@keyframes indeterminate {
  0% {
    transform: translateX(-100%) scaleX(0.5);
  }
  50% {
    transform: translateX(0) scaleX(0.7);
  }
  100% {
    transform: translateX(100%) scaleX(0.5);
  }
}

.log-line {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 11px;
  color: #8b8b96;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Errors */

.error-logs {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-line {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 11px;
  color: #ef4444;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ─── Zone 3: Right ────────────────────────────────────────────────────── */

.zone-right {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 160px;
  flex-shrink: 0;
  align-items: stretch;
}

.delivery-selector {
  display: flex;
  gap: 2px;
  height: 28px;
}

.seg {
  flex: 1;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  color: #8b8b96;
  font-size: 11px;
  font-weight: 500;
  text-transform: capitalize;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 0;
}

.seg:first-child {
  border-radius: 4px 0 0 4px;
}

.seg:last-child {
  border-radius: 0 4px 4px 0;
}

.seg:not(:first-child) {
  border-left: none;
}

.seg:hover:not(:disabled) {
  background: #2a2a30;
  color: #e4e4e7;
}

.seg.active {
  background: #2e2e36;
  border-color: #3a3a42;
  color: #e4e4e7;
}

.seg:disabled {
  background: #1e1e24;
  color: #3a3a42;
  cursor: default;
}

/* Ship button */

.ship-btn {
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s;
}

.ship-btn.primary {
  background: #22c55e;
  color: white;
}

.ship-btn.primary:not(:disabled):hover {
  background: #16a34a;
}

.ship-btn.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ship-btn.shipping {
  background: #1e1e24;
  color: #8b8b96;
  cursor: default;
}

.ship-btn.retry {
  background: #22c55e;
  color: white;
}

.ship-btn.retry:hover {
  background: #16a34a;
}

.ship-btn.shipped {
  background: none;
  color: #8b8b96;
  font-weight: 400;
}

.ship-btn.shipped:hover {
  color: #e4e4e7;
}

.ship-btn.skipped {
  background: none;
  color: #8b8b96;
}

.ship-btn.resume {
  background: none;
  color: #6366f1;
}

.ship-btn.resume:hover {
  color: #818cf8;
}

.ship-btn.muted {
  background: none;
  color: #3a3a42;
  cursor: not-allowed;
}

.ship-btn .mdi {
  font-size: 14px;
}
</style>
