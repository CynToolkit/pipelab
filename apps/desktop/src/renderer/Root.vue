<template>
  <Suspense>
    <template #default>
      <App />
    </template>
    <template #fallback>
      <Skeleton></Skeleton>
    </template>
  </Suspense>
</template>

<script lang="ts" setup>
import App from './App.vue';
</script>

<style lang="scss" scoped>

</style>
