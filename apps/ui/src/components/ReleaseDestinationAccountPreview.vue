<script setup lang="ts">
import { computed } from "vue";
import type { ReleaseDestinationAccountPreview } from "../utils/release-connection-bindings";

const props = defineProps<{ previews: ReleaseDestinationAccountPreview[] }>();
const reusedAccounts = computed(() => {
  const destinationsByConnection = new Map<string, Map<string, ReleaseDestinationAccountPreview>>();
  for (const preview of props.previews) {
    const destinations = destinationsByConnection.get(preview.connectionId) || new Map();
    destinations.set(preview.destinationId, preview);
    destinationsByConnection.set(preview.connectionId, destinations);
  }
  return [...destinationsByConnection.entries()]
    .filter(([, destinations]) => destinations.size > 1)
    .map(([connectionId, destinations]) => {
      const previews = [...destinations.values()];
      return {
        connectionId,
        destinationLabels: previews.map((preview) => preview.destinationLabel),
        connectionName: previews[0]!.connectionName,
        integrationName: previews[0]!.integrationName,
      };
    });
});
</script>

<template>
  <section v-if="previews.length" aria-label="Selected publishing accounts" class="wide">
    <strong>Publishing accounts</strong>
    <ul>
      <li
        v-for="preview in previews"
        :key="`${preview.destinationId}:${preview.locationLabel}:${preview.fieldLabel}`"
      >
        {{ preview.destinationLabel }} · {{ preview.locationLabel }} · {{ preview.fieldLabel }}:
        {{ preview.connectionName }} ({{ preview.integrationName }})
      </li>
    </ul>
    <p
      v-for="warning in reusedAccounts"
      :key="warning.connectionId"
      role="status"
      class="connection-reuse-warning"
    >
      {{ warning.destinationLabels.join(" and ") }} use the same saved Connection “{{
        warning.connectionName
      }}” ({{ warning.integrationName }}). Check that this is intended.
    </p>
  </section>
</template>

<style scoped>
.connection-reuse-warning {
  border-left: 3px solid var(--p-orange-500, #f59e0b);
  margin: 0.75rem 0 0;
  padding-left: 0.75rem;
}
</style>
