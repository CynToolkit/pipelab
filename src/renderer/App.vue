<template>
  <div class="app">
    <suspense timeout="0">
      <template #default>
        <div class="layout">
          <div class="container">
            <!-- <Menubar :model="items">
              <template #start>
                <Skeleton width="10rem" height="4rem"></Skeleton>
              </template>
              <template #end>
                <Avatar label="" size="large" shape="circle" />
              </template>
            </Menubar> -->
            <div class="content">
              <div class="main">
                <router-view v-if="!isLoading"></router-view>
                <div v-else>
                  <Skeleton width="100%" height="100%"></Skeleton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </suspense>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from './store/app'
import { onMounted, ref } from 'vue'
import { primary, primaryDarken1, primaryDarken2 } from './style/main'
import { useFiles } from './store/files'
import { handle } from './composables/handlers'
import { useLogger } from '@@/logger'
import { useAuth } from '@renderer/store/auth'
import { storeToRefs } from 'pinia'
import { useAppSettings } from './store/settings'

const appStore = useAppStore()
const filesStore = useFiles()
const settingsStore = useAppSettings()
const { logger } = useLogger()
const authStore = useAuth()
const { init: authInit } = authStore
const { settings } = storeToRefs(settingsStore)
const { init: initSettings } = settingsStore

const { init } = appStore
const isLoading = ref(false)

handle('log:message', async (event, { value, send }) => {
  console.log('log:message: Received value:', {
    value,
    type: typeof value,
    hasValue: !!value,
    isObject: typeof value === 'object',
    hasMeta: value?._meta,
    metaType: typeof value?._meta
  })

  // Validate that value exists and is an object before accessing properties
  if (!value || typeof value !== 'object') {
    console.warn('log:message: Invalid value received:', {
      value,
      type: typeof value,
      hasValue: !!value
    })
    send({
      type: 'end',
      data: undefined
    })
    return
  }

  // Check if the value has _meta property before accessing it
  if (
    value &&
    value._meta &&
    typeof value._meta === 'object' &&
    value._meta.logLevelId !== undefined
  ) {
    try {
      const values = Object.entries(value)
        .filter(([key]) => key !== '_meta')
        .map(([, v]) => v)

      // Filter out undefined values to prevent tslog errors
      const filteredValues = values.filter((v) => v !== undefined)
      const logLevelName = value._meta.logLevelName || 'LOG'

      logger()
        .getSubLogger({
          name: 'Main'
        })
        .log(value._meta.logLevelId, ...[logLevelName, ...filteredValues])
    } catch (error) {
      console.error('log:message: Error processing log message:', error)
    }
  } else {
    console.warn('log:message: Value missing _meta property or _meta is not an object:', {
      hasMeta: !!value._meta,
      metaType: typeof value._meta,
      valueKeys: Object.keys(value || {})
    })
  }

  send({
    type: 'end',
    data: undefined
  })
})

onMounted(async () => {
  isLoading.value = true

  await filesStore.load()
  await init()
  await initSettings()
  await authInit()

  logger().info('init done')
  // const result = await api.execute('')

  console.log('settings', settings.value)

  isLoading.value = false
})
</script>

<style lang="scss">
.app,
.layout,
.content {
  height: 100%;
  overflow: hidden;
}

.content {
  display: flex;

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 300px;
    background-color: v-bind(primary);
    color: white;

    &.hidden {
      display: none;
    }

    .sidebar-title {
      font-size: 2rem;
      text-align: center;
      margin: 16px 12px;
      margin-bottom: 64px;
      margin-top: 32px;
    }

    .list {
      margin: 8px;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .list-item {
        cursor: pointer;
        padding: 8px 16px;
        font-size: 1.5rem;
        transition: background-color 0.25s;
        border-radius: 4px;
        color: white;
        text-decoration: none;

        .icon {
          margin-right: 8px;
        }

        &:hover {
          background-color: v-bind(primaryDarken1);
        }
      }
    }
  }

  .main {
    flex: 1;
  }
}

.container {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.router-link-active {
  background-color: v-bind(primaryDarken2);
}

.version {
  font-size: 1.2rem;
  margin: 16px;
  text-align: center;
}
</style>
