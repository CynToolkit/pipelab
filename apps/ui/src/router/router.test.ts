import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { preserveDesktopCliPort } from "./preserve-desktop-cli-port";

describe("Desktop CLI port routing", () => {
  it("keeps the authenticated sidecar port when navigating between pages", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/dashboard", component: { render: () => null } },
        { path: "/workflows", component: { render: () => null } },
      ],
    });
    router.beforeEach(preserveDesktopCliPort);

    await router.push("/dashboard?cliPort=44225");
    await router.push("/workflows");

    expect(router.currentRoute.value.fullPath).toBe("/workflows?cliPort=44225");
  });
});
