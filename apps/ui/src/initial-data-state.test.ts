import { describe, expect, it, vi } from "vitest";
import { loadInitialData } from "./initial-data-state";

describe("loadInitialData", () => {
  it("classifies unavailable backends separately from config failures", async () => {
    const load = vi.fn().mockRejectedValue(new Error("connection closed"));

    await expect(loadInitialData([{ section: "projects", load }], () => false)).resolves.toEqual({
      type: "error",
      failure: {
        kind: "backend-disconnected",
        message: "connection closed",
      },
    });
  });

  it.each([
    ["projects", "project-config"],
    ["settings", "project-config"],
    ["connections", "connections"],
    ["plugins", "other"],
  ] as const)("classifies %s load failures", async (section, kind) => {
    const load = vi.fn().mockRejectedValue(new Error("invalid persisted data"));

    await expect(loadInitialData([{ section, load }], () => true)).resolves.toEqual({
      type: "error",
      failure: { kind, message: "invalid persisted data" },
    });
  });

  it("loads all required data and can be retried after a failure", async () => {
    const first = vi.fn().mockRejectedValueOnce(new Error("temporary failure"));
    const retry = vi.fn().mockResolvedValue(undefined);
    const loaders = [{ section: "projects" as const, load: first }];

    await expect(loadInitialData(loaders, () => true)).resolves.toMatchObject({ type: "error" });
    await expect(
      loadInitialData([{ section: "projects", load: retry }], () => true),
    ).resolves.toEqual({
      type: "success",
    });
    expect(retry).toHaveBeenCalledOnce();
  });
});
