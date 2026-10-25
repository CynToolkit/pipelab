import type {
  ConnectionsConfig,
  IntegrationDefinition,
  RendererProviderMetadata,
  ReleaseCatalog,
  ReleaseBuildProfileConfig,
  ReleaseConfig,
  ReleaseFieldDefinition,
  WorkflowConnectionBinding,
} from "@pipelab/shared";
import { connectionIntegrationFieldValue } from "./connection-field-values";

const connectionAliasPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;

type ConnectionValues = Record<string, Record<string, string>>;
type ConnectionReference = { alias: string; integration?: string };

const collectConnectionReferences = (
  fields: ReleaseFieldDefinition[] | undefined,
  values: Record<string, unknown>,
  references: Map<string, Set<string | undefined>>,
) => {
  for (const field of fields || []) {
    if (field.type !== "connection") continue;
    const alias = values[field.key];
    if (typeof alias !== "string" || alias.length === 0) continue;
    let integrations = references.get(alias);
    if (!integrations) {
      integrations = new Set();
      references.set(alias, integrations);
    }
    integrations.add(field.integration);
  }
};

const releaseConnectionReferences = (
  config: ReleaseConfig,
  catalog: ReleaseCatalog,
  activeOnly = false,
): ConnectionReference[] => {
  const references = new Map<string, Set<string | undefined>>();
  const source = catalog.sources.find((candidate) => candidate.id === config.source.provider);
  collectConnectionReferences(source?.fields, config.source.config, references);

  for (const build of config.builds.filter((candidate) => !activeOnly || candidate.enabled)) {
    const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
    collectConnectionReferences(producer?.fields, build.config, references);
    for (const target of build.targets.filter((candidate) => !activeOnly || candidate.enabled)) {
      const targetDefinition = producer?.targets.find((candidate) => candidate.id === target.id);
      collectConnectionReferences(targetDefinition?.fields, target.config, references);
    }
  }

  for (const destination of config.destinations.filter(
    (candidate) => !activeOnly || candidate.enabled,
  )) {
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    collectConnectionReferences(definition?.fields, destination.config, references);
    for (const slot of destination.slots.filter((candidate) => !activeOnly || candidate.enabled))
      collectConnectionReferences(definition?.slotFields, slot.config, references);
  }

  return [...references].flatMap(([alias, integrations]) =>
    [...integrations].map((integration) => ({ alias, integration })),
  );
};

export const releaseWorkflowConnectionAliases = (
  config: ReleaseConfig,
  catalog: ReleaseCatalog,
) => [...new Set(releaseConnectionReferences(config, catalog).map(({ alias }) => alias))];

const connectionValues = (
  connection: ConnectionsConfig["connections"][number],
  definition: IntegrationDefinition,
) =>
  Object.fromEntries(
    definition.fields.map((field) => [
      field.key,
      connectionIntegrationFieldValue(connection, field.key),
    ]),
  );

export const connectionDraftForIntegration = (
  integration: string,
  providers: readonly RendererProviderMetadata[],
) => {
  const matchingProviders = providers.filter(
    (provider) =>
      provider.id === integration ||
      provider.packageName === integration ||
      provider.integrations?.some((candidate) => candidate.name === integration),
  );
  const provider = matchingProviders.length === 1 ? matchingProviders[0] : undefined;
  if (!provider)
    throw new Error(
      `No provider Connection schema is registered for integration '${integration}'.`,
    );
  const definition = integrationForReference(integration, providers);
  if (!definition.fields.length)
    throw new Error(`Provider Connection schema '${definition.name}' does not define any fields.`);

  return {
    integration: provider.packageName || provider.id,
    integrationName: definition.name,
    values: Object.fromEntries(definition.fields.map(({ key }) => [key, ""])),
  };
};

export const connectionDraftMatchesIntegration = (
  integration: string | undefined,
  draft: { integration: string; integrationName: string },
) =>
  Boolean(
    integration && (draft.integration === integration || draft.integrationName === integration),
  );

export const connectionOptionsForIntegration = (
  connections: readonly ConnectionsConfig["connections"][number][],
  integration?: string,
) =>
  connections
    .filter(
      (connection) =>
        !integration ||
        connection.pluginName === integration ||
        connection.integrationName === integration,
    )
    .map((connection) => ({
      label: `${connection.name.trim() || connection.id} · ${connection.integrationName || connection.pluginName}`,
      value: connection.id,
    }));

export interface ReleaseDestinationAccountPreview {
  destinationId: string;
  destinationLabel: string;
  locationLabel: string;
  fieldLabel: string;
  connectionId: string;
  connectionName: string;
  integrationName: string;
}

export const releaseDestinationLocalName = (
  destination: ReleaseConfig["destinations"][number],
  destinations: ReleaseConfig["destinations"],
) => {
  const sameProviderDestinations = destinations.filter(
    (candidate) => candidate.provider === destination.provider,
  );
  const usedNames = new Set(
    sameProviderDestinations.flatMap((candidate) => {
      const savedName = candidate.name?.trim();
      return savedName ? [savedName] : [];
    }),
  );
  let targetName: string | undefined;
  for (const candidate of sameProviderDestinations) {
    const savedName = candidate.name?.trim();
    let localName = savedName;
    if (!localName) {
      let number = 1;
      while (usedNames.has(`Destination ${number}`)) number += 1;
      localName = `Destination ${number}`;
    }
    usedNames.add(localName);
    if (candidate.id === destination.id) targetName = localName;
  }
  return targetName || "Destination 1";
};

export const releaseDestinationDisplayLabel = (providerLabel: string, localName: string) =>
  `${providerLabel} — ${localName}`;

export const releaseDestinationConnectionPreviews = (
  config: ReleaseConfig,
  catalog: ReleaseCatalog,
  connections: ConnectionsConfig,
): ReleaseDestinationAccountPreview[] => {
  const connectionsById = new Map(
    connections.connections.map((connection) => [connection.id, connection]),
  );
  const bindingsByAlias = new Map(
    (connections.workflowBindings || [])
      .filter((binding) => binding.workflowId === config.id)
      .map((binding) => [binding.alias, binding.connectionId]),
  );
  const previews: ReleaseDestinationAccountPreview[] = [];

  for (const destination of config.destinations.filter((candidate) => candidate.enabled)) {
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    if (!definition) continue;
    const destinationLabel = releaseDestinationDisplayLabel(
      definition.label || destination.provider,
      releaseDestinationLocalName(destination, config.destinations),
    );
    const addFields = (
      fields: ReleaseFieldDefinition[] | undefined,
      values: Record<string, unknown>,
      locationLabel: string,
    ) => {
      for (const field of fields || []) {
        if (field.type !== "connection") continue;
        const alias = values[field.key];
        if (typeof alias !== "string" || !alias) continue;
        const connectionId = bindingsByAlias.get(alias);
        const connection = connectionId ? connectionsById.get(connectionId) : undefined;
        if (!connection) continue;
        if (
          field.integration &&
          connection.pluginName !== field.integration &&
          connection.integrationName !== field.integration
        )
          continue;
        previews.push({
          destinationId: destination.id,
          destinationLabel,
          locationLabel,
          fieldLabel: field.label,
          connectionId: connection.id,
          connectionName:
            connection.name.trim() || connection.integrationName || connection.pluginName,
          integrationName: connection.integrationName || connection.pluginName,
        });
      }
    };

    addFields(definition.fields, destination.config, "Destination");
    destination.slots.forEach((slot, index) => {
      if (slot.enabled)
        addFields(
          definition.slotFields,
          slot.config,
          slot.name?.trim() || `Deployment ${index + 1}`,
        );
    });
  }

  return previews;
};

export const suggestUniqueConnectionBinding = (
  connections: readonly ConnectionsConfig["connections"][number][],
  integration?: string,
  existingBinding = "",
) => {
  if (!integration || existingBinding) return undefined;
  const matches = connectionOptionsForIntegration(connections, integration);
  return matches.length === 1 ? matches[0] : undefined;
};

const integrationForReference = (
  integration: string | undefined,
  providers: readonly RendererProviderMetadata[],
): IntegrationDefinition => {
  if (!integration) throw new Error("Workflow Connection alias has no provider schema.");
  const matchingProviders = providers.filter(
    (provider) =>
      provider.id === integration ||
      provider.packageName === integration ||
      provider.integrations?.some((candidate) => candidate.name === integration),
  );
  if (matchingProviders.length !== 1)
    throw new Error(
      `No provider Connection schema is registered for integration '${integration}'.`,
    );

  const provider = matchingProviders[0]!;
  const namedIntegrations = provider.integrations?.filter(
    (candidate) => candidate.name === integration,
  );
  const definition =
    namedIntegrations?.length === 1
      ? namedIntegrations[0]
      : namedIntegrations?.length === 0 &&
          (provider.id === integration || provider.packageName === integration)
        ? provider.integrations?.length === 1
          ? provider.integrations[0]
          : undefined
        : undefined;
  if (!definition)
    throw new Error(
      `No unambiguous provider Connection schema is registered for integration '${integration}'.`,
    );
  return definition;
};

export const connectionFieldsForIntegration = (
  integration: string,
  providers: readonly RendererProviderMetadata[],
) => {
  const definition = integrationForReference(integration, providers);
  if (!definition.fields.length)
    throw new Error(`Provider Connection schema '${definition.name}' does not define any fields.`);
  return definition.fields;
};

export const resolveDesktopWorkflowConnectionValues = (
  config: ReleaseConfig,
  catalog: ReleaseCatalog,
  connections: ConnectionsConfig,
  providers: readonly RendererProviderMetadata[],
): ConnectionValues => {
  const connectionsById = new Map(
    connections.connections.map((connection) => [connection.id, connection]),
  );
  const values: ConnectionValues = {};

  for (const { alias, integration } of releaseConnectionReferences(config, catalog, true)) {
    const binding = connections.workflowBindings?.find(
      (candidate) => candidate.workflowId === config.id && candidate.alias === alias,
    );
    const connection = binding ? connectionsById.get(binding.connectionId) : undefined;
    if (binding && !connection)
      throw new Error(
        `Workflow '${config.id}' has a remembered Connection alias '${alias}' bound to missing Connection '${binding.connectionId}'`,
      );
    if (!connection) {
      if (connectionAliasPattern.test(alias))
        throw new Error(
          `Workflow '${config.id}' has no remembered Connection for alias '${alias}'.`,
        );
      throw new Error(`Workflow '${config.id}' references missing Connection '${alias}'.`);
    }
    if (
      integration &&
      connection.pluginName !== integration &&
      connection.integrationName !== integration
    )
      throw new Error(
        `Workflow connection alias '${alias}' is bound to a Connection outside integration '${integration}'.`,
      );
    values[alias] = connectionValues(connection, integrationForReference(integration, providers));
  }

  return values;
};

export const workflowConnectionBindingValue = (
  connections: ConnectionsConfig,
  workflowId: string,
  alias: string,
) =>
  connections.workflowBindings?.find(
    (binding) => binding.workflowId === workflowId && binding.alias === alias,
  )?.connectionId || "";

export const setWorkflowConnectionBinding = (
  bindings: WorkflowConnectionBinding[] = [],
  workflowId: string,
  alias: string,
  connectionId: string,
) => {
  if (connectionId && !connectionAliasPattern.test(alias))
    throw new Error("Enter a valid workflow Connection alias before selecting a Connection.");
  const remaining = bindings.filter(
    (binding) => binding.workflowId !== workflowId || binding.alias !== alias,
  );
  return connectionId ? [...remaining, { workflowId, alias, connectionId }] : remaining;
};

export const suggestWorkflowConnectionAlias = (name: string, usedAliases: readonly string[]) => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug ? (/^[a-z_]/.test(slug) ? slug : `connection-${slug}`) : "connection";
  const used = new Set(usedAliases);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
};

const renameFieldAlias = (
  fields: ReleaseFieldDefinition[] | undefined,
  values: Record<string, unknown>,
  from: string,
  to: string,
) => {
  let updated = 0;
  for (const field of fields || []) {
    if (field.type === "connection" && values[field.key] === from) {
      values[field.key] = to;
      updated++;
    }
  }
  return updated;
};

export const renameWorkflowConnectionAlias = (
  config: ReleaseConfig,
  catalog: ReleaseCatalog,
  workflowBindings: WorkflowConnectionBinding[] = [],
  from: string,
  to: string,
): { config: ReleaseConfig; workflowBindings: WorkflowConnectionBinding[] } => {
  if (!connectionAliasPattern.test(to))
    throw new Error(
      "Alias must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens.",
    );
  if (
    from !== to &&
    (releaseWorkflowConnectionAliases(config, catalog).includes(to) ||
      workflowBindings.some((binding) => binding.workflowId === config.id && binding.alias === to))
  )
    throw new Error(`Workflow '${config.id}' already uses Connection alias '${to}'.`);

  const renamedConfig = structuredClone(config);
  let updated = 0;
  const source = catalog.sources.find(
    (candidate) => candidate.id === renamedConfig.source.provider,
  );
  updated += renameFieldAlias(source?.fields, renamedConfig.source.config, from, to);
  for (const build of renamedConfig.builds) {
    const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
    updated += renameFieldAlias(producer?.fields, build.config, from, to);
    for (const target of build.targets) {
      const definition = producer?.targets.find((candidate) => candidate.id === target.id);
      updated += renameFieldAlias(definition?.fields, target.config, from, to);
    }
  }
  for (const destination of renamedConfig.destinations) {
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    updated += renameFieldAlias(definition?.fields, destination.config, from, to);
    for (const slot of destination.slots)
      updated += renameFieldAlias(definition?.slotFields, slot.config, from, to);
  }

  if (
    updated === 0 &&
    !workflowBindings.some((binding) => binding.workflowId === config.id && binding.alias === from)
  )
    throw new Error(`Workflow '${config.id}' does not use Connection alias '${from}'.`);

  const renamedBindings = workflowBindings.map((binding) =>
    binding.workflowId === config.id && binding.alias === from
      ? { ...binding, alias: to }
      : binding,
  );
  return { config: renamedConfig, workflowBindings: renamedBindings };
};

export const renameWorkflowConnectionAliasWithDraft = (
  config: ReleaseConfig,
  draftBuild: ReleaseBuildProfileConfig | undefined,
  catalog: ReleaseCatalog,
  workflowBindings: WorkflowConnectionBinding[] = [],
  from: string,
  to: string,
): {
  config: ReleaseConfig;
  draftBuild?: ReleaseBuildProfileConfig;
  workflowBindings: WorkflowConnectionBinding[];
} => {
  const persistedAliasExists = releaseWorkflowConnectionAliases(config, catalog).includes(from);
  const bindingExists = workflowBindings.some(
    (binding) => binding.workflowId === config.id && binding.alias === from,
  );
  const renamedPersisted =
    persistedAliasExists || bindingExists
      ? renameWorkflowConnectionAlias(config, catalog, workflowBindings, from, to)
      : { config, workflowBindings };

  if (!draftBuild) return renamedPersisted;

  const draftAwareConfig = structuredClone(config);
  const draftBuildIndex = draftAwareConfig.builds.findIndex((build) => build.id === draftBuild.id);
  if (draftBuildIndex < 0) return renamedPersisted;
  draftAwareConfig.builds[draftBuildIndex] = structuredClone(draftBuild);

  const renamedDraftAware = renameWorkflowConnectionAlias(
    draftAwareConfig,
    catalog,
    workflowBindings,
    from,
    to,
  );
  return {
    config: renamedPersisted.config,
    draftBuild: renamedDraftAware.config.builds[draftBuildIndex],
    workflowBindings: renamedDraftAware.workflowBindings,
  };
};

export const persistWorkflowConnectionAliasRename = async ({
  workflowId,
  previousAlias,
  previousBindings,
  nextBindings,
  saveConnections,
  saveWorkflow,
}: {
  workflowId: string;
  previousAlias: string;
  previousBindings: WorkflowConnectionBinding[];
  nextBindings: WorkflowConnectionBinding[];
  saveConnections: (bindings: WorkflowConnectionBinding[]) => Promise<void>;
  saveWorkflow: () => Promise<void>;
}): Promise<void> => {
  const previousAliasBindings = previousBindings.filter(
    (binding) => binding.workflowId === workflowId && binding.alias === previousAlias,
  );
  const stagedBindings = [...nextBindings];
  for (const binding of previousAliasBindings) {
    if (
      !stagedBindings.some(
        (staged) => staged.workflowId === binding.workflowId && staged.alias === binding.alias,
      )
    )
      stagedBindings.push(binding);
  }

  const sameBindings = (left: WorkflowConnectionBinding[], right: WorkflowConnectionBinding[]) =>
    JSON.stringify(left) === JSON.stringify(right);
  if (!sameBindings(previousBindings, stagedBindings)) await saveConnections(stagedBindings);
  await saveWorkflow();
  if (!sameBindings(stagedBindings, nextBindings)) await saveConnections(nextBindings);
};
