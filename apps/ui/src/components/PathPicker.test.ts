// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import PrimeVue from "primevue/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import PathPicker from "./PathPicker.vue";

vi.mock("primevue/button", () => ({
  default: defineComponent({
    setup(_, { attrs }) {
      return () => h("button", attrs);
    },
  }),
}));

const execute = vi.fn();
vi.mock("@renderer/composables/api", () => ({ useAPI: () => ({ execute }) }));

const mountedApps: App[] = [];
const mountPicker = (props: Record<string, unknown>) => {
  const root = document.createElement("div");
  const updates: string[] = [];
  const app = createApp(
    defineComponent({
      render: () =>
        h(PathPicker, {
          ...props,
          "onUpdate:modelValue": (value: string) => updates.push(value),
        }),
    }),
  );
  app.use(PrimeVue);
  app.mount(root);
  mountedApps.push(app);
  return { root, updates };
};
const clickBrowse = async (root: HTMLElement) => {
  (root.querySelector("button") as HTMLButtonElement).click();
  await nextTick();
  await Promise.resolve();
};

afterEach(() => {
  while (mountedApps.length) mountedApps.pop()?.unmount();
  execute.mockReset();
});

describe("PathPicker", () => {
  it("opens an existing-file dialog by default", async () => {
    execute.mockResolvedValue({
      type: "success",
      result: { canceled: false, filePaths: ["/data/game.c3p"] },
    });
    const { root, updates } = mountPicker({ kind: "file", label: "Project file" });
    await clickBrowse(root);

    expect(execute).toHaveBeenCalledWith(
      "dialog:showOpenDialog",
      expect.objectContaining({ properties: ["openFile"] }),
    );
    expect(updates).toEqual(["/data/game.c3p"]);
  });

  it("opens a save dialog for output files that may not exist yet", async () => {
    execute.mockResolvedValue({
      type: "success",
      result: { canceled: false, filePath: "/out/release.zip" },
    });
    const { root, updates } = mountPicker({
      kind: "file",
      mode: "save",
      label: "ZIP output path",
      fileExtensions: ["zip"],
      modelValue: "/out/old.zip",
    });
    await clickBrowse(root);

    expect(execute).toHaveBeenCalledWith(
      "dialog:showSaveDialog",
      expect.objectContaining({
        title: "Choose zip output path",
        defaultPath: "/out/old.zip",
        filters: [{ name: "Supported files", extensions: ["zip"] }],
      }),
    );
    expect(updates).toEqual(["/out/release.zip"]);
  });

  it("keeps the value when the save dialog is cancelled", async () => {
    execute.mockResolvedValue({ type: "success", result: { canceled: true } });
    const { root, updates } = mountPicker({ kind: "file", mode: "save", label: "Output" });
    await clickBrowse(root);

    expect(updates).toEqual([]);
  });
});
