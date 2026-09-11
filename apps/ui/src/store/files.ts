import { SavedFile } from "@pipelab/shared";
import { defineStore } from "pinia";
import { Draft, create } from "mutative";
import { klona } from "klona";
import { FileRepo, ReleaseFlow } from "@pipelab/shared";
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
      await api.execute("pipeline:delete-by-name", { name: pipeline.configName });
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

  const saveReleaseFlow = async (flow: ReleaseFlow) => {
    await api.execute("release-flow:save-by-name", {
      name: `release-flows/${flow.id}`,
      data: JSON.stringify(flow),
    });
    await update((state) => {
      state.releaseFlows = state.releaseFlows || [];
      const next = {
        id: flow.id,
        project: flow.project,
        lastModified: new Date().toISOString(),
        type: "internal-release-flow" as const,
        configName: `release-flows/${flow.id}`,
      };
      const index = state.releaseFlows.findIndex((item) => item.id === flow.id);
      if (index === -1) state.releaseFlows.push(next);
      else state.releaseFlows[index] = next;
    });
  };

  const removeReleaseFlow = async (id: string) => {
    const flow = files.value.releaseFlows?.find((item) => item.id === id);
    if (flow) await api.execute("release-flow:delete-by-name", { name: flow.configName });
    await update((state) => {
      state.releaseFlows = (state.releaseFlows || []).filter((item) => item.id !== id);
    });
  };

  return {
    files: files,

    load,
    update,
    remove,
    removeProject,
    transferPipeline,
    saveReleaseFlow,
    removeReleaseFlow,
  };
});
