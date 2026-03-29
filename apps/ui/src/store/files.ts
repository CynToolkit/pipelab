import { SavedFile } from "@pipelab/shared";
import { defineStore } from "pinia";
import { ref } from "vue";
import { Draft, create } from "mutative";
import { createConfig } from "@renderer/utils/config";
import { klona } from "klona";
import { FileRepo, fileRepoMigrations, defaultFileRepo as defaultValue } from "@pipelab/shared";
import { ValiError } from "valibot";

export interface File {
  data: SavedFile;
}

export const useFiles = defineStore("files", () => {
  const files = ref<FileRepo>(defaultValue);

  const {
    load: loadConfig,
    save: saveConfig,
    backup: backupConfig,
  } = createConfig<FileRepo>("projects");

  const update = async (callback: (state: Draft<FileRepo>) => void) => {
    files.value = create(files.value, callback);
    console.log("files.value", files.value);
    await saveConfig(klona(files.value));
  };

  const load = async () => {
    const data = await loadConfig();

    if (data.type === "success") {
      files.value = data.result.result as FileRepo;
    } else {
      files.value = defaultValue;
    }
  };

  const remove = async (id: string) => {
    update((state) => {
      state.pipelines = state.pipelines.filter((file) => file.id !== id);
    });
  };

  const removeProject = async (id: string) => {
    update((state) => {
      state.projects = state.projects.filter((project) => project.id !== id);
    });
  };

  const transferPipeline = async (pipelineId: string, projectId: string) => {
    update((state) => {
      const pipeline = state.pipelines.find((p) => p.id === pipelineId);
      if (pipeline) {
        pipeline.project = projectId;
      }
    });
  };

  return {
    files: files,
    // files: readonly(files),

    load,
    update,
    remove,
    removeProject,
    transferPipeline,
  };
});
