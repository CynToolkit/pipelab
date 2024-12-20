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

const appStore = useAppStore()
const filesStore = useFiles()
const { logger } = useLogger()

const { init } = appStore
const isLoading = ref(false)

handle('log:message', async (event, { value, send }) => {
  // console.log('value._meta', value._meta)
  if (value._meta) {
    const values = Object.entries(value)
      .filter(([key]) => key !== '_meta')
      .map(([, v]) => v)
    logger()
      .getSubLogger({
        name: 'Main'
      })
      .log(value._meta.logLevelId, ...[value._meta.logLevelName, ...values])
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
  logger().info('init done')
  // const result = await api.execute('')
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
