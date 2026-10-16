import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import type { Data } from "@pipelab/shared";
import { useAPI } from "./api";

vi.mock("@pipelab/shared", () => ({
  ShellChannels: ["dialog:showOpenDialog", "dialog:showSaveDialog", "shell:openPath"],
  useLogger: () => ({ logger: () => ({ debug() {}, error() {} }) }),
}));

vi.mock("./websocket-client", () => ({
  useWebSocketAPI: () => ({
    execute: async () => undefined,
    isConnected: { value: false },
    on() {},
  }),
}));

vi.mock("../store/ui", () => ({ useUIStore: () => ({ showFilePicker() {} }) }));

describe("useAPI Electron shell calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serializes nested reactive file filters before invoking the native dialog", async () => {
    const fileProps = reactive({ extensions: ["c3p"] });
    const options: Data<"dialog:showOpenDialog"> = {
      title: "Choose project file",
      properties: ["openFile"],
      filters: [{ name: "Supported files", extensions: fileProps.extensions }],
    };
    const invoke = vi.fn(async (_channel: string, value: unknown) => {
      structuredClone(value);
      return { canceled: false, filePaths: ["/fixture/project.c3p"] };
    });

    vi.stubGlobal("window", { electron: { ipcRenderer: { invoke } } });

    expect(() => structuredClone(options)).toThrow();

    await expect(useAPI().execute("dialog:showOpenDialog", options)).resolves.toEqual({
      type: "success",
      result: { canceled: false, filePaths: ["/fixture/project.c3p"] },
    });
    expect(invoke).toHaveBeenCalledWith("dialog:showOpenDialog", {
      title: "Choose project file",
      properties: ["openFile"],
      filters: [{ name: "Supported files", extensions: ["c3p"] }],
    });
  });

  it("reveals artifacts through the Desktop preload instead of an unregistered IPC channel", async () => {
    const showItemInFolder = vi.fn(async () => undefined);
    const invoke = vi.fn();
    vi.stubGlobal("window", {
      pipelab: { showItemInFolder },
      electron: { ipcRenderer: { invoke } },
    });

    await expect(useAPI().openPath("/tmp/pipelab/artifacts/package")).resolves.toEqual({
      type: "success",
      result: undefined,
    });
    expect(showItemInFolder).toHaveBeenCalledWith("/tmp/pipelab/artifacts/package");
    expect(invoke).not.toHaveBeenCalled();
  });
});
