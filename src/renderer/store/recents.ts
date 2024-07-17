import { SaveLocation } from "@@/save-location";
import { defineStore } from "pinia";
import { ref } from "vue";

export interface Recent {
  id: string
  saveLocation: SaveLocation
  name: string
}

export const useRecentsStore = defineStore('recent-files', () => {
  const recents = ref<Record<string, Recent>>({});

  const addRecent = (recent: Recent) => {
    recents.value[recent.id] = recent
  }

  const removeRecent = (recentId: Recent['id']) => {
    delete recents.value[recentId]
  }

  return {
    recents,

    addRecent,
    removeRecent,
  }
}, {
  persist: true,
})
