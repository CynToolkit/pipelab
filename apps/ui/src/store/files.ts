import { SavedFile } from "@pipelab/shared/model";
import { defineStore } from "pinia";
import { ref } from "vue";
import { Draft, create } from "mutative";
import { createConfig } from "@renderer/utils/config";
import { klona } from "klona";
import {
  FileRepo,
  fileRepoMigrations,
  defaultFileRepo as defaultValue,
} from "@pipelab/shared/config";
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

    console.log("data", data);

    if (data.type === "success") {
      // TODO: beter typing for "data.result.result.version"
      if (fileRepoMigrations.needMigration(data.result.result.version ?? "0.0.0")) {
        console.log("backing up");
        backupConfig(data.result.result.version);
      }
      try {
        const filerepo = await fileRepoMigrations.migrate(data.result.result);
        files.value = filerepo;
      } catch (e) {
        if (e instanceof ValiError) {
          console.log("error", e.issues);
        }
        console.error("error", e);
        files.value = defaultValue;
      }
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
