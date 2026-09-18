<template>
    <div>
        <div>
            <div class="loading"></div>
            <h1>Verifying your email...</h1>
            <p>{{ message }}</p>
        </div>
    </div>
</template>

<script lang="ts" setup>
const props = withDefaults(defineProps<{
    message: string
}>(), {
    message: 'Please wait while we complete the verification process.'
})

</script>

<style lang="scss" scoped>
.icon-container {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-container svg {
  width: 40px;
  height: 40px;
}

.loading {
  display: inline-block;
  width: 50px;
  height: 50px;
  border: 3px solid rgba(79, 70, 229, 0.2);
  border-radius: 50%;
  border-top-color: #4f46e5;
  animation: spin 1s ease-in-out infinite;
  margin: 0 auto 1.5rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.btn {
  display: inline-block;
  background-color: #4f46e5;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  margin-top: 1rem;
}

.btn:hover {
  background-color: #4338ca;
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #1f2937;
}

p {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: #6b7280;
}
</style>