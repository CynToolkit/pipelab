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
              <div class="sidebar">
                <div class="sidebar-title">Cyn</div>

                <div class="list">
                  <router-link class="list-item" :to="{ name: 'Dashboard' }">
                    <i class="icon pi pi-objects-column"></i>
                    Dashboard
                  </router-link>
                  <router-link class="list-item" :to="{ name: 'Scenarios' }">
                    <i class="icon pi pi-list"></i>
                    Scenarios
                  </router-link>
                  <router-link class="list-item" :to="{ name: 'Team' }">
                    <i class="icon pi pi-list"></i>
                    Team
                  </router-link>
                  <router-link class="list-item" :to="{ name: 'Settings' }">
                    <i class="icon pi pi-list"></i>
                    Settings
                  </router-link>
                </div>
              </div>
              <div class="main">
                <router-view></router-view>
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
import { onMounted } from 'vue'
import { primary, primaryDarken1, primaryDarken2 } from './style/main'
import { useFiles } from './store/files'
import { useAPI } from './composables/api'

const appStore = useAppStore()
const filesStore = useFiles()

const { init } = appStore

await filesStore.load()
console.log('files loaded', filesStore)
await init()
console.log('init done')

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
</style>
