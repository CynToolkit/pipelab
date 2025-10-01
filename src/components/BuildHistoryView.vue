<template>
  <div class="build-history-view">
    <div class="header">
      <div class="header-left">
        <button class="back-button" @click="goToDashboard">
          <i class="pi pi-arrow-left"></i>
          <span>Back to Dashboard</span>
        </button>
        <div class="header-titles">
          <h2>Build History</h2>
          <div class="status">
            <span v-if="isPaidUser" class="paid-user">✓ Premium Feature</span>
            <span v-else class="free-user">⚠ Premium Feature Required</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Auth Loading State -->
    <div v-if="isAuthLoading" class="loading">
      <p>Checking authentication...</p>
    </div>

    <!-- Subscription Error Display -->
    <div v-else-if="showSubscriptionErrorState" class="subscription-error">
      <div class="error-icon">🚫</div>
      <div class="error-content">
        <h3>Subscription Required</h3>
        <p>{{ subscriptionError?.userMessage }}</p>
        <button class="upgrade-btn" @click="showSubscriptionOptions">Upgrade Subscription</button>
      </div>
    </div>

    <!-- Build History Content (only show if authorized) -->
    <div v-else-if="canAccessBuildHistory" class="build-history-content">
      <!-- Loading State -->
      <div v-if="isLoading" class="loading">
        <p>Loading build history...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error && !hasSubscriptionError" class="error">
        <p>{{ error }}</p>
        <button class="retry-btn" @click="retryLoad">Retry</button>
      </div>

      <!-- Build History List -->
      <div v-else class="history-list">
        <div v-if="hasEntries" class="entries">
          <div v-for="entry in entries" :key="entry.id" class="entry" :class="entry.status">
            <div class="entry-header">
              <h4>{{ entry.projectName }}</h4>
              <span class="status-badge" :class="entry.status">
                {{ entry.status }}
              </span>
            </div>
            <div class="entry-details">
              <p>Started: {{ formatDate(entry.startTime) }}</p>
              <p v-if="entry.duration">Duration: {{ formatDuration(entry.duration) }}</p>
              <p>Steps: {{ entry.completedSteps }}/{{ entry.totalSteps }}</p>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <p>No build history entries found.</p>
          <p>Start a build to see your history here!</p>
        </div>
      </div>

      <!-- Storage Info -->
      <div v-if="storageInfo" class="storage-info">
        <p>Total Entries: {{ storageInfo.totalEntries }}</p>
        <p>Total Size: {{ formatSize(storageInfo.totalSize) }}</p>
      </div>
    </div>

    <!-- Unauthorized State -->
    <div v-else class="unauthorized">
      <div class="unauthorized-icon">🔒</div>
      <h3>Premium Feature</h3>
      <p>Build history is available with a premium subscription.</p>
      <button class="upgrade-btn" @click="showSubscriptionOptions">Upgrade to Access</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBuildHistory } from '../renderer/store/build-history'
import { useAuth } from '../renderer/store/auth'
import { storeToRefs } from 'pinia'

// Composables
const router = useRouter()
const buildHistoryStore = useBuildHistory()
const authStore = useAuth()

// Destructure auth store with storeToRefs for proper reactivity
const { authState, isLoadingSubscriptions } = storeToRefs(authStore)

// Computed properties from build history store
const {
  entries,
  isLoading,
  error,
  subscriptionError,
  storageInfo,
  hasEntries,
  isPaidUser,
  hasSubscriptionError
} = buildHistoryStore

// Computed properties from auth store (for internal use)

// Auth-related computed properties (used in template)
const isAuthLoading = computed(
  () =>
    authStore.authState === 'INITIALIZING' ||
    authStore.authState === 'LOADING' ||
    authStore.isAuthenticating ||
    authStore.isLoadingSubscriptions
)

const canAccessBuildHistory = computed(
  () => isPaidUser.value && !hasSubscriptionError.value && !isAuthLoading.value
)

const showSubscriptionErrorState = computed(
  () => hasSubscriptionError.value && !isAuthLoading.value
)

// Watch for auth state changes and reload data when appropriate
const stopAuthWatcher = watch(
  [() => authState.value, () => isPaidUser.value],
  async ([newAuthState, newIsPaidUser], [oldAuthState, oldIsPaidUser]) => {
    // If auth state changed from loading to signed in and user became paid
    if (
      (oldAuthState === 'LOADING' || oldAuthState === 'INITIALIZING') &&
      newAuthState === 'SIGNED_IN' &&
      newIsPaidUser &&
      !oldIsPaidUser
    ) {
      await loadBuildHistory()
    }
    // If user lost paid status, clear the data
    else if (oldIsPaidUser && !newIsPaidUser) {
      // The store will handle clearing subscription errors when isPaidUser becomes false
      // but we should clear any existing data
      buildHistoryStore.clearError()
    }
  },
  { immediate: false }
)

// Watch for subscription loading state changes
const stopSubscriptionWatcher = watch(
  () => isLoadingSubscriptions.value,
  async (newIsLoading, oldIsLoading) => {
    // When subscription loading completes and user becomes paid, load data
    if (oldIsLoading && !newIsLoading && isPaidUser.value && !hasSubscriptionError.value) {
      await loadBuildHistory()
    }
  },
  { immediate: false }
)

// Helper function to load build history
const loadBuildHistory = async (): Promise<void> => {
  if (isPaidUser.value && !hasSubscriptionError.value) {
    try {
      await buildHistoryStore.loadEntries()
    } catch (error) {
      console.error('Failed to load build history after auth change:', error)
    }
  }
}

// Cleanup watchers on unmount
onUnmounted(() => {
  stopAuthWatcher()
  stopSubscriptionWatcher()
})

// Methods
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString()
}

const formatDuration = (duration: number): string => {
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const retryLoad = async (): Promise<void> => {
  try {
    await buildHistoryStore.loadEntries()
  } catch (error) {
    console.error('Failed to retry loading build history:', error)
  }
}

const showSubscriptionOptions = (): void => {
  // In a real implementation, this would open a subscription modal or redirect to pricing page
  alert('This would open subscription options or redirect to pricing page')
}

const goToDashboard = (): void => {
  router.push('/dashboard')
}

// Initialize - load entries when component mounts
onMounted(async () => {
  if (isPaidUser) {
    try {
      await buildHistoryStore.loadEntries()
    } catch (error) {
      console.error('Failed to load build history:', error)
    }
  }
})
</script>

<style scoped>
.build-history-view {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid #ddd;
  padding: 8px 12px;
  border-radius: 6px;
  color: #666;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s ease;
}

.back-button:hover {
  background-color: #f8f9fa;
  border-color: #007bff;
  color: #007bff;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.9em;
}

.paid-user {
  background-color: #d4edda;
  color: #155724;
}

.free-user {
  background-color: #fff3cd;
  color: #856404;
}

.subscription-error {
  display: flex;
  align-items: center;
  padding: 20px;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 8px;
  color: #721c24;
}

.error-icon {
  font-size: 24px;
  margin-right: 15px;
}

.error-content h3 {
  margin: 0 0 10px 0;
}

.error-content p {
  margin: 0 0 15px 0;
}

.upgrade-btn {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.upgrade-btn:hover {
  background-color: #0056b3;
}

.build-history-content {
  min-height: 200px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.error {
  text-align: center;
  padding: 40px;
  color: #dc3545;
}

.retry-btn {
  background-color: #6c757d;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
}

.retry-btn:hover {
  background-color: #545b62;
}

.history-list {
  margin-top: 20px;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.entry {
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: white;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.entry-header h4 {
  margin: 0;
  color: #333;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  text-transform: uppercase;
}

.status-badge.completed {
  background-color: #d4edda;
  color: #155724;
}

.status-badge.failed {
  background-color: #f8d7da;
  color: #721c24;
}

.status-badge.running {
  background-color: #cce7ff;
  color: #0066cc;
}

.entry-details p {
  margin: 5px 0;
  color: #666;
  font-size: 0.9em;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.empty-state p {
  margin: 10px 0;
}

.storage-info {
  margin-top: 30px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 8px;
  font-size: 0.9em;
  color: #666;
}

.storage-info p {
  margin: 5px 0;
}

.unauthorized {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.unauthorized-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.unauthorized h3 {
  margin: 0 0 15px 0;
  color: #333;
}

.unauthorized p {
  margin: 0 0 25px 0;
}
</style>
