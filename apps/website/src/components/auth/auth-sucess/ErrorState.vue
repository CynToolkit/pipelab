<template>
    <div>
        <div>
            <div class="icon-container error">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </div>
            <h1>Verification Failed</h1>
            <p>{{ message }}</p>
            <button
                class="btn"
                @click="$emit('retry')"
            >Try Again</button>
        </div>
    </div>
</template>

<script lang="ts" setup>
const props = withDefaults(defineProps<{
    message: string
}>(), {
    message: 'Your email has been successfully verified. You can now close this window and continue using our services.'
})

</script>

<style lang="scss" scoped>
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

.icon-container {
  width: 80px;
  height: 80px;
  margin: 0 auto 1.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-container.error {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--error-color);
}

.icon-container svg {
  width: 40px;
  height: 40px;
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