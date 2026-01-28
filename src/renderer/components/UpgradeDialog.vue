<template>
  <div class="upgrade-dialog">
    <div class="dialog-header">
      <h2>Upgrade Your Plan</h2>
      <p>Choose the plan that works best for you</p>
    </div>

    <div class="plans-container">
      <!-- Loading state -->
      <div v-if="isLoading" class="loading-state">
        <p>Loading plans...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="error-state">
        <p class="error-message">{{ error }}</p>
        <button @click="fetchPlansFromPolar" class="retry-button">Retry</button>
      </div>

      <!-- Plans display -->
      <template v-else>
        <div
          v-for="(plan, index) in plans"
          :key="index"
          class="plan-card"
          :class="{ placeholder: plan.name === 'Free' }"
        >
          <div class="plan-header">
            <h3>{{ plan.name }}</h3>
            <div v-for="(price, pIndex) in plan.prices" :key="pIndex">
              <span class="price" v-if="price.amountType === 'free'">Free</span>
              <span class="price" v-else>
                {{ price.priceAmount / 100 }} {{ price.priceCurrency }} /
                {{ price.recurringInterval }}
              </span>
            </div>
          </div>
          <div class="plan-features">
            <ul>
              <li v-for="(benefit, bIndex) in plan.benefits" :key="bIndex">
                {{ benefit.description }}
              </li>
            </ul>
          </div>
          <button @click="upgradeToPlan(plan)" class="plan-button" :disabled="plan.name === 'Free'">
            {{ plan.name === 'Free' ? 'Current Plan' : `Upgrade to ${plan.name}` }}
          </button>
        </div>
      </template>
    </div>

    <div class="dialog-footer"></div>
  </div>
</template>

<script lang="ts" setup>
import { useAPI } from '@renderer/composables/api'
import { supabase } from '@@/supabase'
import { ref, onMounted } from 'vue'

const emit = defineEmits(['close'])
const api = useAPI()

// State for plans, loading, and error
const plans = ref([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// Function to fetch plans from polar.sh using the actual cloud function
const fetchPlansFromPolar = async () => {
  try {
    isLoading.value = true
    error.value = null

    // Call the actual polar-available-plans cloud function
    const { data, error: apiError } = await supabase.functions.invoke('polar-available-plans')

    if (apiError) {
      throw apiError
    }

    // Process the response data
    plans.value = data.plans || []
  } catch (err) {
    error.value = 'Failed to fetch plans. Please try again later.'
    console.error('Error fetching plans:', err)
  } finally {
    isLoading.value = false
  }
}

const upgradeToPlan = async (plan: any) => {
  console.log(plan)
  const result = await supabase.functions.invoke('checkout', {
    body: {
      itemIds: [plan.id]
    }
  })
  console.log('result', result)
  window.open(result.data.checkoutURL)
}

// Fetch plans when component is mounted
onMounted(() => {
  fetchPlansFromPolar()
})

const closeDialog = () => {
  emit('close')
}
</script>

<style lang="scss" scoped>
.upgrade-dialog {
  background: white;
  border-radius: 12px;
}

.loading-state,
.error-state {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.error-message {
  color: #ef4444;
  margin-bottom: 16px;
}

.retry-button {
  background-color: #6366f1;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #5856eb;
  }
}

.dialog-header {
  text-align: center;
  margin-bottom: 24px;

  h2 {
    font-size: 24px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
  }

  p {
    color: #666;
    font-size: 14px;
  }
}

.plans-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.plan-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  position: relative;

  &.placeholder {
    opacity: 0.7;
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .price {
      font-size: 14px;
      font-weight: 500;
      color: #6366f1;
    }
  }

  .plan-features {
    margin-bottom: 16px;

    ul {
      list-style: none;
      padding: 0;
      margin: 0;

      li {
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
        padding-left: 16px;
        position: relative;

        &::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #6366f1;
        }
      }
    }
  }

  .plan-button {
    width: 100%;
    padding: 8px 16px;
    background-color: #6366f1;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: #5856eb;
    }

    &:disabled {
      background-color: #cbd5e1;
      cursor: not-allowed;
    }
  }
}

.dialog-footer {
  text-align: right;

  .close-button {
    background: none;
    border: 1px solid #d1d5db;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;

    &:hover {
      background-color: #f3f4f6;
    }
  }
}
</style>
