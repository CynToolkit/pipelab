import { describe, expect, it } from "vitest";
import type {
  ConnectionsConfig,
  RendererProviderMetadata,
  ReleaseCatalog,
  ReleaseConfig,
  WorkflowConnectionBinding,
} from "@pipelab/shared";
import {
  connectionDraftForIntegration,
  connectionDraftMatchesIntegration,
  connectionOptionsForIntegration,
  releaseDestinationConnectionPreviews,
  persistWorkflowConnectionAliasRename,
  releaseDestinationLocalName,
  renameWorkflowConnectionAliasWithDraft,
  renameWorkflowConnectionAlias,
  releaseWorkflowConnectionAliases,
  resolveDesktopWorkflowConnectionValues,
  setWorkflowConnectionBinding,
  suggestUniqueConnectionBinding,
  suggestWorkflowConnectionAlias,
  workflowConnectionBindingValue,
} from "./release-connection-bindings";

const catalog: ReleaseCatalog = {
  buildTypes: [],
  sources: [
    {
      id: "source/project",
      label: "Project",
      output: { kind: "project", container: "directory" },
      defaultConfig: {},
      fields: [
        { key: "sourceAccount", type: "connection", label: "Source account", integration: "git" },
      ],
    },
  ],
  producers: [],
  destinations: [
    {
      id: "destination/store",
      label: "Store",
      accepts: {},
      defaultConfig: {},
      fields: [{ key: "account", type: "connection", label: "Account", integration: "store" }],
      slotFields: [
        {
          key: "deliveryAccount",
          type: "connection",
          label: "Delivery account",
          integration: "store",
        },
      ],
    },
  ],
};

const workflow = (): ReleaseConfig => ({
  version: "3.1.0",
  id: "release-a",
  project: "project-a",
  name: "Release A",
  source: { provider: "source/project", config: { sourceAccount: "publish" } },
  builds: [],
  destinations: [
    {
      id: "store-one",
      provider: "destination/store",
      enabled: true,
      config: { account: "publish", note: "publish" },
      slots: [
        {
          id: "slot-one",
          enabled: true,
          config: { deliveryAccount: "archive" },
        },
      ],
    },
  ],
});

const connection = (id: string, pluginName: string, token: string) => ({
  id,
  pluginName,
  name: id,
  createdAt: "2026-01-01",
  isDefault: false,
  token,
});

const connections: ConnectionsConfig = {
  version: "1.0.0",
  connections: [
    connection("git-prod", "git", "git-prod-token"),
    connection("git-preview", "git", "git-preview-token"),
    connection("store-prod", "store", "store-prod-token"),
    connection("store-archive", "store", "store-archive-token"),
    connection("store-preview", "store", "store-preview-token"),
  ],
  workflowBindings: [
    { workflowId: "release-a", alias: "publish", connectionId: "git-prod" },
    { workflowId: "release-a", alias: "archive", connectionId: "store-archive" },
    { workflowId: "release-a", alias: "store", connectionId: "store-prod" },
    { workflowId: "release-b", alias: "publish", connectionId: "git-preview" },
  ],
};

const steamProvider: RendererProviderMetadata = {
  id: "@pipelab/plugin-steam",
  packageName: "@pipelab/plugin-steam",
  name: "Steam",
  description: "Steam provider",
  icon: { type: "icon", icon: "steam" },
  isOfficial: true,
  integrations: [
    {
      name: "Steam Account",
      fields: [{ key: "username", label: "Username", type: "text" }],
    },
  ],
};

const connectionProviders: RendererProviderMetadata[] = ["git", "store"].map((id) => ({
  id,
  packageName: id,
  name: id,
  description: `${id} provider`,
  icon: { type: "icon", icon: id },
  isOfficial: true,
  integrations: [{ name: id, fields: [{ key: "token", label: "Token", type: "password" }] }],
}));

const steamCatalog: ReleaseCatalog = {
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [
    {
      id: "destination/steam",
      label: "Steam",
      accepts: {},
      defaultConfig: {},
      fields: [
        {
          key: "account",
          type: "connection",
          label: "Steam account",
          integration: "@pipelab/plugin-steam",
        },
      ],
      slotFields: [],
    },
  ],
};

const steamWorkflow = (): ReleaseConfig => ({
  version: "3.1.0",
  id: "steam-release",
  project: "project-a",
  name: "Steam release",
  source: { provider: "source/none", config: {} },
  builds: [],
  destinations: [
    {
      id: "steam",
      provider: "destination/steam",
      enabled: true,
      config: { account: "steam-publish" },
      slots: [],
    },
  ],
});

describe("Desktop workflow connection bindings", () => {
  it("opens the matching provider schema when an integration has multiple Connection types", () => {
    const construct: RendererProviderMetadata = {
      id: "@pipelab/plugin-construct",
      packageName: "@pipelab/plugin-construct",
      name: "Construct",
      description: "Construct provider",
      icon: { type: "icon", icon: "pi-box" },
      isOfficial: true,
      integrations: [
        { name: "Browser Executable", fields: [{ key: "path", label: "Path", type: "file" }] },
        { name: "Browser Profile", fields: [{ key: "path", label: "Path", type: "directory" }] },
        {
          name: "Construct Account",
          fields: [
            { key: "username", label: "Username", type: "text" },
            { key: "password", label: "Password", type: "password" },
          ],
        },
      ],
    };

    const draft = connectionDraftForIntegration("Construct Account", [construct]);
    expect(draft).toEqual({
      integration: "@pipelab/plugin-construct",
      integrationName: "Construct Account",
      values: { username: "", password: "" },
    });
    expect(connectionDraftMatchesIntegration("Construct Account", draft)).toBe(true);
  });

  it("does not invent a generic credential field when provider schema is missing", () => {
    const providerWithoutConnections: RendererProviderMetadata = {
      id: "@pipelab/plugin-unavailable",
      packageName: "@pipelab/plugin-unavailable",
      name: "Unavailable",
      description: "Provider metadata without Connection definitions",
      icon: { type: "icon", icon: "pi-box" },
      isOfficial: true,
      integrations: [],
    };

    expect(() =>
      connectionDraftForIntegration("@pipelab/plugin-unavailable", [providerWithoutConnections]),
    ).toThrow("No unambiguous provider Connection schema is registered");
  });

  it("labels compatible accounts by account and provider integration and suggests only a unique match", () => {
    const savedConnections = [
      {
        id: "steam-production",
        pluginName: "@pipelab/plugin-steam",
        integrationName: "Steam Account",
        name: "Production",
        createdAt: "2026-01-01",
        isDefault: false,
        username: "steam-user",
      },
      {
        id: "itch-production",
        pluginName: "@pipelab/plugin-itch",
        integrationName: "Itch Butler Account",
        name: "Production",
        createdAt: "2026-01-01",
        isDefault: false,
        apiKey: "itch-key",
      },
    ];

    const options = connectionOptionsForIntegration(savedConnections, "@pipelab/plugin-steam");

    expect(options).toEqual([{ label: "Production · Steam Account", value: "steam-production" }]);
    expect(suggestUniqueConnectionBinding(savedConnections, "@pipelab/plugin-steam")).toEqual(
      options[0],
    );
    expect(
      suggestUniqueConnectionBinding(savedConnections, "@pipelab/plugin-steam", "steam-production"),
    ).toBeUndefined();
    expect(
      suggestUniqueConnectionBinding(
        [...savedConnections, { ...savedConnections[0], id: "steam-preview", name: "Preview" }],
        "@pipelab/plugin-steam",
      ),
    ).toBeUndefined();
  });

  it("previews the selected account for each active destination and slot before shipping", () => {
    const config = workflow();
    config.destinations[0].config.account = "store";
    config.destinations[0].slots[0].config.deliveryAccount = "archive";

    expect(releaseDestinationConnectionPreviews(config, catalog, connections)).toEqual([
      {
        destinationId: "store-one",
        destinationLabel: "Store — Destination 1",
        locationLabel: "Destination",
        fieldLabel: "Account",
        connectionId: "store-prod",
        connectionName: "store-prod",
        integrationName: "store",
      },
      {
        destinationId: "store-one",
        destinationLabel: "Store — Destination 1",
        locationLabel: "Deployment 1",
        fieldLabel: "Delivery account",
        connectionId: "store-archive",
        connectionName: "store-archive",
        integrationName: "store",
      },
    ]);
  });

  it("keeps repeated destinations distinguishable by their workflow display names", () => {
    const config = workflow();
    config.destinations[0]!.name = "Studio";
    config.destinations[0]!.config.account = "store";
    config.destinations[0]!.slots = [];
    config.destinations.push({
      ...structuredClone(config.destinations[0]!),
      id: "store-two",
      name: "Personal",
      config: { account: "personal" },
      slots: [],
    });
    const local = structuredClone(connections);
    local.workflowBindings?.push({
      workflowId: config.id,
      alias: "personal",
      connectionId: "store-preview",
    });

    expect(
      releaseDestinationConnectionPreviews(config, catalog, local).map(
        ({ destinationLabel, connectionName }) => ({ destinationLabel, connectionName }),
      ),
    ).toEqual([
      { destinationLabel: "Store — Studio", connectionName: "store-prod" },
      { destinationLabel: "Store — Personal", connectionName: "store-preview" },
    ]);
  });

  it("chooses a distinct fallback for an unnamed imported destination", () => {
    const destinations = [
      { ...workflow().destinations[0]!, name: "Destination 2" },
      { ...workflow().destinations[0]!, id: "store-two", name: undefined },
    ];

    expect(releaseDestinationLocalName(destinations[1]!, destinations)).toBe("Destination 1");
  });

  it("reserves later saved names before choosing an imported destination fallback", () => {
    const destinations = [
      { ...workflow().destinations[0]!, id: "imported", name: undefined },
      { ...workflow().destinations[0]!, id: "named", name: "Destination 1" },
    ];

    expect(releaseDestinationLocalName(destinations[0]!, destinations)).toBe("Destination 2");
  });

  it("omits disabled destination and slot accounts from the Ship preview", () => {
    const config = workflow();
    config.destinations[0].config.account = "store";
    config.destinations[0].slots[0].config.deliveryAccount = "archive";
    config.destinations[0].slots[0].enabled = false;
    config.destinations.push({
      id: "store-disabled",
      provider: "destination/store",
      enabled: false,
      config: { account: "store" },
      slots: [],
    });

    expect(releaseDestinationConnectionPreviews(config, catalog, connections)).toEqual([
      expect.objectContaining({
        destinationId: "store-one",
        connectionName: "store-prod",
      }),
    ]);
  });

  it("resolves Desktop Construct aliases from the account schema only", () => {
    const constructProvider: RendererProviderMetadata = {
      id: "@pipelab/plugin-construct",
      packageName: "@pipelab/plugin-construct",
      name: "Construct",
      description: "Construct provider",
      icon: { type: "icon", icon: "pi-box" },
      isOfficial: true,
      integrations: [
        { name: "Browser Executable", fields: [{ key: "path", label: "Path", type: "file" }] },
        { name: "Browser Profile", fields: [{ key: "path", label: "Path", type: "directory" }] },
        {
          name: "Construct Account",
          fields: [
            { key: "username", label: "Username", type: "text" },
            { key: "password", label: "Password", type: "password" },
          ],
        },
      ],
    };
    const constructCatalog: ReleaseCatalog = {
      ...catalog,
      sources: [
        {
          id: "construct/source",
          label: "Construct project",
          output: { kind: "application", platform: "web", container: "directory" },
          defaultConfig: {},
          fields: [
            {
              key: "accountConnectionId",
              type: "connection",
              label: "Construct account",
              integration: "Construct Account",
            },
          ],
        },
      ],
      destinations: [],
    };
    const constructWorkflow: ReleaseConfig = {
      ...workflow(),
      id: "construct-release",
      source: {
        provider: "construct/source",
        config: { accountConnectionId: "construct-production" },
      },
      destinations: [],
    };
    const password = "construct-secret";

    expect(
      resolveDesktopWorkflowConnectionValues(
        constructWorkflow,
        constructCatalog,
        {
          version: "1.0.0",
          connections: [
            {
              id: "construct-account-local",
              pluginName: "@pipelab/plugin-construct",
              integrationName: "Construct Account",
              name: "Production account",
              createdAt: "2026-01-01",
              isDefault: false,
              username: "construct-user@example.test",
              password,
            },
          ],
          workflowBindings: [
            {
              workflowId: "construct-release",
              alias: "construct-production",
              connectionId: "construct-account-local",
            },
          ],
        },
        [constructProvider],
      ),
    ).toEqual({
      "construct-production": {
        username: "construct-user@example.test",
        password,
      },
    });
  });

  it("does not resolve disabled destinations or slots as run Connections", () => {
    const config = workflow();
    config.destinations[0].config.account = "store";
    config.destinations[0].slots[0].enabled = false;
    config.destinations[0].slots[0].config.deliveryAccount = "disabled-slot";
    config.destinations.push({
      id: "disabled-store",
      provider: "destination/store",
      enabled: false,
      config: { account: "disabled-destination" },
      slots: [
        {
          id: "disabled-deployment",
          enabled: true,
          config: { deliveryAccount: "disabled-destination-slot" },
        },
      ],
    });

    expect(releaseWorkflowConnectionAliases(config, catalog)).toEqual([
      "publish",
      "store",
      "disabled-slot",
      "disabled-destination",
      "disabled-destination-slot",
    ]);
    expect(
      resolveDesktopWorkflowConnectionValues(config, catalog, connections, connectionProviders),
    ).toEqual({
      publish: { token: "git-prod-token" },
      store: { token: "store-prod-token" },
    });
  });

  it("preserves aliases for rename checks while resolving only enabled build Connections", () => {
    const catalogWithBuildConnections: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          id: "engine",
          label: "Engine",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: {},
          fields: [
            { key: "account", type: "connection", label: "Build account", integration: "store" },
          ],
          targets: [
            {
              id: "inactive-target",
              label: "Inactive target",
              defaultConfig: {},
              fields: [
                {
                  key: "targetAccount",
                  type: "connection",
                  label: "Target account",
                  integration: "store",
                },
              ],
            },
            {
              id: "active-target",
              label: "Active target",
              defaultConfig: {},
              fields: [
                {
                  key: "targetAccount",
                  type: "connection",
                  label: "Target account",
                  integration: "store",
                },
              ],
            },
          ],
        },
      ],
    };
    const config = workflow();
    config.destinations[0].config.account = "store";
    config.builds = [
      {
        id: "disabled-build",
        type: "desktop",
        engine: "engine",
        enabled: false,
        config: { account: "disabled-build" },
        targets: [
          {
            id: "inactive-target",
            enabled: true,
            config: { targetAccount: "disabled-build-target" },
          },
        ],
      },
      {
        id: "active-build",
        type: "desktop",
        engine: "engine",
        enabled: true,
        config: { account: "active-build" },
        targets: [
          { id: "inactive-target", enabled: false, config: { targetAccount: "disabled-target" } },
          { id: "active-target", enabled: true, config: { targetAccount: "active-target" } },
        ],
      },
    ];

    expect(releaseWorkflowConnectionAliases(config, catalogWithBuildConnections)).toEqual([
      "publish",
      "disabled-build",
      "disabled-build-target",
      "active-build",
      "disabled-target",
      "active-target",
      "store",
      "archive",
    ]);
    const activeBindings: ConnectionsConfig = {
      ...connections,
      workflowBindings: [
        ...connections.workflowBindings!,
        { workflowId: "release-a", alias: "active-build", connectionId: "store-prod" },
        { workflowId: "release-a", alias: "active-target", connectionId: "store-prod" },
      ],
    };
    expect(
      resolveDesktopWorkflowConnectionValues(
        config,
        catalogWithBuildConnections,
        activeBindings,
        connectionProviders,
      ),
    ).toEqual({
      publish: { token: "git-prod-token" },
      "active-build": { token: "store-prod-token" },
      "active-target": { token: "store-prod-token" },
      store: { token: "store-prod-token" },
      archive: { token: "store-archive-token" },
    });
  });

  it("forwards only Steam's provider-declared username field", () => {
    const declaredFields = steamProvider.integrations![0]!.fields;
    const account = {
      id: "steam-local",
      pluginName: steamProvider.id,
      integrationName: "Steam Account",
      name: "Steam account",
      createdAt: "2026-01-01",
      isDefault: false,
      username: "provider-user",
      email: "legacy-email",
    };
    const steamConnections: ConnectionsConfig = {
      version: "1.0.0",
      connections: [account],
      workflowBindings: [
        { workflowId: "steam-release", alias: "steam-publish", connectionId: account.id },
      ],
    };

    const resolved = resolveDesktopWorkflowConnectionValues(
      steamWorkflow(),
      steamCatalog,
      steamConnections,
      [steamProvider],
    );

    expect(resolved["steam-publish"]).toEqual(
      Object.fromEntries(
        declaredFields.map((field) => [field.key, account[field.key as "username"]]),
      ),
    );
  });

  it("resolves each connection alias through its workflow binding across multiple destinations", () => {
    const config = workflow();
    config.source.config.sourceAccount = "publish";
    config.destinations[0].config.account = "store";

    expect(
      resolveDesktopWorkflowConnectionValues(config, catalog, connections, connectionProviders),
    ).toEqual({
      publish: { token: "git-prod-token" },
      store: { token: "store-prod-token" },
      archive: { token: "store-archive-token" },
    });
  });

  it("lists connection aliases from the provider fields in the active workflow", () => {
    expect(releaseWorkflowConnectionAliases(workflow(), catalog)).toEqual(["publish", "archive"]);
  });

  it("resolves the same alias independently for each workflow", () => {
    const secondWorkflow = { ...workflow(), id: "release-b" };
    secondWorkflow.source.config.sourceAccount = "publish";
    secondWorkflow.destinations[0].config.account = "";
    secondWorkflow.destinations[0].slots[0].config.deliveryAccount = "";

    expect(
      resolveDesktopWorkflowConnectionValues(
        secondWorkflow,
        catalog,
        connections,
        connectionProviders,
      ),
    ).toEqual({
      publish: { token: "git-preview-token" },
    });
  });

  it("keeps a workflow alias stable when its local Connection display name changes", () => {
    const config = workflow();
    config.destinations[0].config.account = "store";
    const renamedConnections = {
      ...connections,
      connections: connections.connections.map((item) =>
        item.id === "git-prod" ? { ...item, name: "Renamed account" } : item,
      ),
    };

    expect(config.source.config.sourceAccount).toBe("publish");
    expect(
      resolveDesktopWorkflowConnectionValues(
        config,
        catalog,
        renamedConnections,
        connectionProviders,
      ).publish,
    ).toEqual({
      token: "git-prod-token",
    });
  });

  it("does not infer a saved local Connection for a legacy workflow field", () => {
    const currentWorkflow = workflow();
    currentWorkflow.version = "3.0.0";
    currentWorkflow.source.config.sourceAccount = "git-prod";
    const noSourceBinding = {
      ...connections,
      workflowBindings: connections.workflowBindings?.filter(
        (binding) => !(binding.workflowId === currentWorkflow.id && binding.alias === "publish"),
      ),
    };

    expect(() =>
      resolveDesktopWorkflowConnectionValues(
        currentWorkflow,
        catalog,
        noSourceBinding,
        connectionProviders,
      ),
    ).toThrow("Workflow 'release-a' has no remembered Connection for alias 'git-prod'");
  });

  it("fails before execution when a selected alias has no remembered binding", () => {
    const config = workflow();
    const noPublishBinding = {
      ...connections,
      workflowBindings: connections.workflowBindings?.filter(
        (binding) => !(binding.workflowId === config.id && binding.alias === "publish"),
      ),
    };

    expect(() =>
      resolveDesktopWorkflowConnectionValues(
        config,
        catalog,
        noPublishBinding,
        connectionProviders,
      ),
    ).toThrow("Workflow 'release-a' has no remembered Connection for alias 'publish'");
  });

  it("fails when a remembered binding points to a deleted Connection", () => {
    const config = workflow();
    const brokenBindings = {
      ...connections,
      connections: [...connections.connections, connection("publish", "git", "wrong-token")],
      workflowBindings: [
        { workflowId: config.id, alias: "publish", connectionId: "deleted-connection" },
      ],
    };

    expect(() =>
      resolveDesktopWorkflowConnectionValues(config, catalog, brokenBindings, connectionProviders),
    ).toThrow(
      "Workflow 'release-a' has a remembered Connection alias 'publish' bound to missing Connection 'deleted-connection'",
    );
  });

  it("renames only typed connection references and bindings in the selected workflow", () => {
    const config = workflow();
    const sourceBindings: WorkflowConnectionBinding[] = [
      { workflowId: "release-a", alias: "publish", connectionId: "git-prod" },
      { workflowId: "release-b", alias: "publish", connectionId: "store-preview" },
    ];

    const renamed = renameWorkflowConnectionAlias(
      config,
      catalog,
      sourceBindings,
      "publish",
      "release",
    );

    expect(renamed.config.source.config.sourceAccount).toBe("release");
    expect(renamed.config.destinations[0].config.account).toBe("release");
    expect(renamed.config.destinations[0].config.note).toBe("publish");
    expect(renamed.workflowBindings).toEqual([
      { workflowId: "release-a", alias: "release", connectionId: "git-prod" },
      { workflowId: "release-b", alias: "publish", connectionId: "store-preview" },
    ]);
    expect(config.source.config.sourceAccount).toBe("publish");
  });

  it("rejects renaming an active alias to one used by a disabled destination", () => {
    const config = workflow();
    config.destinations.push({
      id: "disabled-store",
      provider: "destination/store",
      enabled: false,
      config: { account: "reserved-alias" },
      slots: [],
    });

    expect(() =>
      renameWorkflowConnectionAlias(
        config,
        catalog,
        connections.workflowBindings,
        "publish",
        "reserved-alias",
      ),
    ).toThrow("Workflow 'release-a' already uses Connection alias 'reserved-alias'.");
  });

  it("renames an alias introduced in an unapplied build draft more than once", () => {
    const draftCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          id: "producer/test",
          label: "Test producer",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: {},
          targets: [],
          fields: [{ key: "account", type: "connection", label: "Account", integration: "git" }],
        },
      ],
    };
    const config = workflow();
    config.builds.push({
      id: "build-one",
      type: "desktop",
      engine: "producer/test",
      enabled: true,
      config: { account: "" },
      targets: [],
    });
    const draftBuild = {
      ...config.builds[0],
      config: { account: "first-alias" },
    };

    const firstRename = renameWorkflowConnectionAliasWithDraft(
      config,
      draftBuild,
      draftCatalog,
      [],
      "first-alias",
      "second-alias",
    );
    const secondRename = renameWorkflowConnectionAliasWithDraft(
      firstRename.config,
      firstRename.draftBuild,
      draftCatalog,
      firstRename.workflowBindings,
      "second-alias",
      "final-alias",
    );

    expect(secondRename.config.builds[0]?.config.account).toBe("");
    expect(secondRename.draftBuild?.config.account).toBe("final-alias");
  });

  it("renames a bound alias in the persisted workflow and its open build draft once", () => {
    const draftCatalog: ReleaseCatalog = {
      ...catalog,
      producers: [
        {
          id: "producer/test",
          label: "Test producer",
          accepts: {},
          planning: { mode: "build" },
          defaultConfig: {},
          targets: [],
          fields: [{ key: "account", type: "connection", label: "Account", integration: "git" }],
        },
      ],
    };
    const config = workflow();
    config.builds.push({
      id: "build-one",
      type: "desktop",
      engine: "producer/test",
      enabled: true,
      config: { account: "publish" },
      targets: [],
    });

    const renamed = renameWorkflowConnectionAliasWithDraft(
      config,
      { ...config.builds[0], config: { account: "publish" } },
      draftCatalog,
      connections.workflowBindings,
      "publish",
      "release",
    );

    expect(renamed.config.source.config.sourceAccount).toBe("release");
    expect(renamed.draftBuild?.config.account).toBe("release");
    expect(renamed.workflowBindings).toContainEqual({
      workflowId: "release-a",
      alias: "release",
      connectionId: "git-prod",
    });
    expect(renamed.workflowBindings).not.toContainEqual({
      workflowId: "release-a",
      alias: "publish",
      connectionId: "git-prod",
    });
  });

  it("keeps the prior binding usable when the workflow save fails during alias rename", async () => {
    const previousBindings: WorkflowConnectionBinding[] = [
      { workflowId: "release-a", alias: "publish", connectionId: "git-prod" },
    ];
    const nextBindings: WorkflowConnectionBinding[] = [
      { workflowId: "release-a", alias: "release", connectionId: "git-prod" },
    ];
    const writes: Array<"connections" | "workflow"> = [];
    const savedBindings: WorkflowConnectionBinding[][] = [];

    await expect(
      persistWorkflowConnectionAliasRename({
        workflowId: "release-a",
        previousAlias: "publish",
        previousBindings,
        nextBindings,
        saveConnections: async (bindings) => {
          writes.push("connections");
          savedBindings.push(bindings);
        },
        saveWorkflow: async () => {
          writes.push("workflow");
          throw new Error("workflow save failed");
        },
      }),
    ).rejects.toThrow("workflow save failed");

    expect(writes).toEqual(["connections", "workflow"]);
    expect(savedBindings[0]).toEqual([
      { workflowId: "release-a", alias: "release", connectionId: "git-prod" },
      { workflowId: "release-a", alias: "publish", connectionId: "git-prod" },
    ]);
  });

  it("removes the prior binding only after the renamed workflow save succeeds", async () => {
    const previousBindings: WorkflowConnectionBinding[] = [
      { workflowId: "release-a", alias: "publish", connectionId: "git-prod" },
    ];
    const nextBindings: WorkflowConnectionBinding[] = [
      { workflowId: "release-a", alias: "release", connectionId: "git-prod" },
    ];
    const writes: string[] = [];

    await persistWorkflowConnectionAliasRename({
      workflowId: "release-a",
      previousAlias: "publish",
      previousBindings,
      nextBindings,
      saveConnections: async (bindings) => {
        writes.push(`connections:${bindings.map((binding) => binding.alias).join(",")}`);
      },
      saveWorkflow: async () => {
        writes.push("workflow");
      },
    });

    expect(writes).toEqual(["connections:release,publish", "workflow", "connections:release"]);
  });

  it("rejects a rename that would merge two workflow aliases", () => {
    expect(() =>
      renameWorkflowConnectionAlias(
        workflow(),
        catalog,
        [{ workflowId: "release-a", alias: "publish", connectionId: "git-prod" }],
        "publish",
        "archive",
      ),
    ).toThrow("Workflow 'release-a' already uses Connection alias 'archive'");
  });

  it("updates a remembered binding only for the matching workflow alias", () => {
    const previous: WorkflowConnectionBinding[] = [
      { workflowId: "release-a", alias: "publish", connectionId: "git-prod" },
      { workflowId: "release-b", alias: "publish", connectionId: "git-preview" },
    ];

    const updated = setWorkflowConnectionBinding(previous, "release-a", "publish", "git-preview");

    expect(updated).toEqual([
      { workflowId: "release-b", alias: "publish", connectionId: "git-preview" },
      { workflowId: "release-a", alias: "publish", connectionId: "git-preview" },
    ]);
    expect(workflowConnectionBindingValue(connections, "release-a", "publish")).toBe("git-prod");
  });

  it("suggests a valid unique alias from the current display name", () => {
    expect(suggestWorkflowConnectionAlias("Production Store", ["production-store"])).toBe(
      "production-store-2",
    );
    expect(suggestWorkflowConnectionAlias(" 9 test! ", [])).toBe("connection-9-test");
  });
});
