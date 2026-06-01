import { SavedFile } from "@pipelab/shared";
import { defineStore } from "pinia";
import { Draft, create } from "mutative";
import { klona } from "klona";
import { FileRepo } from "@pipelab/shared";
import { useAPI } from "@renderer/composables/api";
import { useProjectsConfig } from "@renderer/composables/useConfig";

export interface File {
  data: SavedFile;
}

export const useFiles = defineStore("files", () => {
  const api = useAPI();
  const { data: files, load, save } = useProjectsConfig();

  const update = async (callback: (state: Draft<FileRepo>) => void) => {
    files.value = create(files.value, callback);
    console.log("files.value", files.value);
    await save(klona(files.value));
  };

  const remove = async (id: string) => {
    const pipeline = files.value.pipelines?.find((file) => file.id === id);
    if (pipeline && pipeline.type === "internal") {
      await api.execute("config:delete", { config: pipeline.configName });
    }

    update((state) => {
      state.pipelines = (state.pipelines || []).filter((file) => file.id !== id);
    });
  };

  const removeProject = async (id: string) => {
    update((state) => {
      state.projects = state.projects.filter((project) => project.id !== id);
    });
  };

  const transferPipeline = async (pipelineId: string, projectId: string) => {
    update((state) => {
      const pipeline = state.pipelines?.find((p) => p.id === pipelineId);
      if (pipeline) {
        pipeline.project = projectId;
      }
    });
  };

  return {
    files: files,

    load,
    update,
    remove,
    removeProject,
    transferPipeline,
  };
});
