// @vitest-environment jsdom
import { createApp, h, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import type { ReleaseDestinationAccountPreview as ReleaseDestinationAccountPreviewData } from "../utils/release-connection-bindings";
import ReleaseDestinationAccountPreview from "./ReleaseDestinationAccountPreview.vue";

const mountedApps: App[] = [];

afterEach(() => {
  while (mountedApps.length) mountedApps.pop()?.unmount();
});

describe("ReleaseDestinationAccountPreview", () => {
  it("shows the destination and selected account identity before publishing", () => {
    const root = document.createElement("div");
    const preview: ReleaseDestinationAccountPreviewData = {
      destinationId: "store-one",
      destinationLabel: "Store — Studio",
      locationLabel: "Destination",
      fieldLabel: "Account",
      connectionId: "store-prod",
      connectionName: "Production",
      integrationName: "Store account",
    };
    const app = createApp({
      render: () => h(ReleaseDestinationAccountPreview, { previews: [preview] }),
    });
    app.mount(root);
    mountedApps.push(app);

    const content = root.querySelector('[aria-label="Selected publishing accounts"]');
    expect(content?.textContent).toContain(
      "Store — Studio · Destination · Account: Production (Store account)",
    );
  });

  it("warns when two destinations will publish through the same saved account", () => {
    const root = document.createElement("div");
    const preview: ReleaseDestinationAccountPreviewData = {
      destinationId: "studio",
      destinationLabel: "Itch.io — Studio",
      locationLabel: "Destination",
      fieldLabel: "Account",
      connectionId: "itch-production",
      connectionName: "Production",
      integrationName: "Itch account",
    };
    const app = createApp({
      render: () =>
        h(ReleaseDestinationAccountPreview, {
          previews: [
            preview,
            {
              ...preview,
              destinationId: "personal",
              destinationLabel: "Itch.io — Personal",
              connectionId: "itch-production",
            },
          ],
        }),
    });
    app.mount(root);
    mountedApps.push(app);

    const warning = root.querySelector('[role="status"]');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain("Studio");
    expect(warning?.textContent).toContain("Personal");
    expect(warning?.textContent).toContain("Production");
  });

  it("does not warn when destinations use different saved accounts", () => {
    const root = document.createElement("div");
    const app = createApp({
      render: () =>
        h(ReleaseDestinationAccountPreview, {
          previews: [
            {
              destinationId: "studio",
              destinationLabel: "Itch.io — Studio",
              locationLabel: "Destination",
              fieldLabel: "Account",
              connectionId: "itch-production",
              connectionName: "Production",
              integrationName: "Itch account",
            },
            {
              destinationId: "personal",
              destinationLabel: "Itch.io — Personal",
              locationLabel: "Destination",
              fieldLabel: "Account",
              connectionId: "itch-personal",
              connectionName: "Personal",
              integrationName: "Itch account",
            },
          ],
        }),
    });
    app.mount(root);
    mountedApps.push(app);

    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});
