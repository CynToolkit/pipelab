<template>
  <Layout>
    <div class="index">
      <div class="header">
        {{ headerSentence }}
      </div>
      <div class="content">Team</div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Layout from "@renderer/components/Layout.vue";

const headerSentence = computed(() => {
  return `Welcome back!`;
});
</script>
<style scoped>
.header {
  font-size: 2rem;
  margin: 32px 16px 64px 16px;
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
