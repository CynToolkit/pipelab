import { describe, expect, it, vi } from "vitest";
import { resolveItchUsername } from "./export";
import plugin, { createItchUploadTask, itchDestination, WORKFLOW_TASK_ID } from "./index";

describe("Itch release credentials", () => {
  it("keeps its Release destination and task without legacy node metadata", () => {
    expect("nodes" in plugin).toBe(false);
    expect(plugin.release?.destinations?.map((destination) => destination.id)).toContain(
      itchDestination.id,
    );
    expect(createItchUploadTask).toBeTypeOf("function");
    expect(WORKFLOW_TASK_ID).toBe("@pipelab/plugin-itch/itch-upload");
  });

  it("resolves the username from the Itch profile endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: { username: "builder" } }), { status: 200 }),
      ),
    );
    await expect(resolveItchUsername("secret")).resolves.toBe("builder");
    vi.unstubAllGlobals();
  });
});
