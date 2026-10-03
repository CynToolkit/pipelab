import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { FileRepo } from "@pipelab/shared";

const execute = vi.fn();
const save = vi.fn();
const load = vi.fn();
const files = ref<FileRepo>({
  version: "3.0.0",
  projects: [{ id: "project-1", name: "Project", description: "" }],
  pipelines: [],
  workflows: [],
});

vi.mock("@renderer/composables/api", () => ({
  useAPI: () => ({ execute }),
}));
vi.mock("@renderer/composables/useConfig", () => ({
  useProjectsConfig: () => ({ data: files, load, save }),
}));

import { useFiles } from "./files";

describe("useFiles persistence boundaries", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    files.value = {
      version: "3.0.0",
      projects: [{ id: "project-1", name: "Project", description: "" }],
      pipelines: [],
      workflows: [],
    };
    execute.mockReset();
    save.mockReset();
    load.mockReset();
    execute.mockResolvedValue({ type: "success", result: { result: "ok" } });
    save.mockResolvedValue(undefined);
  });

  it("does not commit local project state when persistence fails", async () => {
    save.mockRejectedValueOnce(new Error("disk unavailable"));
    const store = useFiles();

    await expect(
      store.update((state) => {
        state.projects[0].name = "Changed";
      }),
    ).rejects.toThrow("disk unavailable");
    expect(store.files.projects[0]?.name).toBe("Project");
  });

  it("keeps the project list unchanged when project creation cannot be persisted", async () => {
    save.mockRejectedValueOnce(new Error("disk unavailable"));
    const store = useFiles();

    await expect(
      store.update((state) => {
        state.projects.push({ id: "project-2", name: "New project", description: "" });
      }),
    ).rejects.toThrow("disk unavailable");
    expect(store.files.projects.map((project) => project.id)).toEqual(["project-1"]);
  });

  it("keeps the original project name when rename cannot be persisted", async () => {
    save.mockRejectedValueOnce(new Error("disk unavailable"));
    const store = useFiles();

    await expect(
      store.update((state) => {
        state.projects[0]!.name = "Renamed";
      }),
    ).rejects.toThrow("disk unavailable");
    expect(store.files.projects[0]?.name).toBe("Project");
  });
});
