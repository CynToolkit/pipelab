<template>
  <div class="flex flex-column align-items-center p-8">
    <!-- <img
      alt="Pipelab Logo"
      class="w-4rem h-4rem mb-4"
    /> -->
    <h1 class="text-4xl font-bold mb-2">Download Pipelab
      <span v-if="release">({{ release?.tag_name }})</span>
    </h1>
    <p class="text-color-secondary mb-8">
      Choose the version that suits your operating system (OS) and CPU
      architecture
    </p>
    <div class="flex flex-wrap justify-content-center gap-4">
      <DownloadCard os="macOS" :options="macOptions" />
      <DownloadCard os="Windows" :options="windowsOptions" />
      <DownloadCard os="Linux" :options="linuxOptions" />
    </div>
    <div class="flex flex-column text-center justify-content-center mt-8">
      <p>Looking for beta or older versions?</p>
      <a href="https://github.com/CynToolkit/pipelab/releases"
        >Check the releases page</a
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DownloadCard from "@/components/DownloadCard.vue";
import { isAfter } from "date-fns";


const macOptions = computed(() => ([
    { label: ".dmg", value: release.value?.assets.find(asset => asset.name.includes("arm64.dmg"))?.browser_download_url },
    { label: ".zip", value: release.value?.assets.find(asset => asset.name.includes("darwin-arm64"))?.browser_download_url }
]));

const windowsOptions = computed(() => ([
    { label: ".exe", value: release.value?.assets.find(asset => asset.name.includes(".Setup.exe"))?.browser_download_url },
    { label: ".zip", value: release.value?.assets.find(asset => asset.name.includes("win32-x64"))?.browser_download_url }
]));

const linuxOptions = computed(() => ([
  { label: ".zip", value: release.value?.assets.find(asset => asset.name.includes("linux-x64"))?.browser_download_url },
]))

export interface Release {
  url: string
  assets_url: string
  upload_url: string
  html_url: string
  id: number
  author: Author
  node_id: string
  tag_name: string
  target_commitish: string
  name: string
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string
  assets: Asset[]
  tarball_url: string
  zipball_url: string
  body: string
}

export interface Author {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
}

export interface Asset {
  url: string
  id: number
  node_id: string
  name: string
  label: string
  uploader: Uploader
  content_type: string
  state: string
  size: number
  download_count: number
  created_at: string
  updated_at: string
  browser_download_url: string
}

export interface Uploader {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
}

const release = ref<Release>();


fetch("https://api.github.com/repos/CynToolkit/pipelab/releases/latest", {
    headers: {
        "Accept": "application/vnd.github+json",
    }
})
    .then(response => response.json())
    .then((data: Release) => {
        console.log(data)
        release.value = data
    })
</script>
