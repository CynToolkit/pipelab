import { SavedFile } from "@@/model";
import { defineStore } from "pinia";
import { readonly, ref } from "vue";
import { Draft, create } from 'mutative'
import { createConfig } from "@renderer/utils/config";
import { klona } from 'klona'
import { SaveLocation } from "@@/save-location";

export interface File {
  data: SavedFile
}

export interface FileRepo {
  version: string
  data: Record<string, SaveLocation>
}

export const useFile = (name: string) => {
  const file = ref<File>()

  const { load, save } = createConfig<Record<string, File>>(name)

  return {
    save,
    load,
  }
}

const defaultFileRepo: FileRepo = {
  version: "1.0.0",
  data: {}
}

export const useFiles = defineStore('files', () => {
  const files = ref<FileRepo>(defaultFileRepo);

  const { load: loadConfig, save: saveConfig } = createConfig<FileRepo>('projects')

  const update = async (callback: (state: Draft<FileRepo>) => void) => {
    files.value = create(files.value, callback)
    await saveConfig(klona(files.value))
  }

  const load = async () => {
    const data = await loadConfig()

    if ('version' in data.result) {
      files.value = data.result
    } else {
      files.value = defaultFileRepo
    }
  }

  const remove = async (id: string) => {
    update((state) => {
      delete state.data[id]
    })
  }

  const loadFile = (name: string) => {
    const { load, save } = createConfig<Record<string, File>>(name)
    return {
      load, save
    }
  }

  return {
    files: files,
    // files: readonly(files),

    load,
    loadFile,
    update,
    remove,
  }
})
