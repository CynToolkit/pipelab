import { defineStore } from "pinia";
import { Draft, create } from "mutative";
import { klona } from "klona";
import { FileRepo, ReleaseConfig } from "@pipelab/shared";
import { useAPI } from "@renderer/composables/api";
import { useProjectsConfig } from "@renderer/composables/useConfig";

export const useFiles = defineStore("files", () => {
  const api = useAPI();
  const { data: files, load, save } = useProjectsConfig();

  const update = async (callback: (state: Draft<FileRepo>) => void) => {
    const next = create(klona(files.value), callback);
    await save(klona(next));
  };

  const removeProject = async (id: string) => {
    if ((files.value.workflows || []).some((workflow) => workflow.project === id)) {
      throw new Error(`Project '${id}' cannot be deleted while a release workflow references it.`);
    }
    await update((state) => {
      state.projects = state.projects.filter((project) => project.id !== id);
    });
  };

  const saveWorkflow = async (flow: ReleaseConfig) => {
    const result = await api.execute("workflow:save", {
      workflowId: flow.id,
      data: flow,
      projectId: flow.project,
    });
    if (result.type === "error") throw new Error(result.ipcError);
    await load(true);
  };

  const removeWorkflow = async (id: string) => {
    const flow = files.value.workflows?.find((item) => item.id === id);
    if (flow) {
      const result = await api.execute("workflow:delete", {
        workflowId: flow.id,
        projectId: flow.project,
      });
      if (result.type === "error") throw new Error(result.ipcError);
      await load(true);
    }
  };

  return {
    files: files,

    load,
    update,
    removeProject,
    saveWorkflow,
    removeWorkflow,
  };
});
