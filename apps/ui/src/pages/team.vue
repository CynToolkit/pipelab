<template>
  <main class="index">
    <div class="header">
      <h1>{{ headerSentence }}</h1>
    </div>
    <div class="content">Team</div>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";

const headerSentence = computed(() => {
  return `Welcome back!`;
});
</script>
<style scoped>
.header {
  font-size: 2rem;
  margin: 32px 16px 64px 16px;
}

.header h1 {
  margin: 0;
  font-size: inherit;
}

.content {
  display: flex;
  flex-direction: column;
}

.examples {
  .scenarios {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 4px;
  }
}
</style>
