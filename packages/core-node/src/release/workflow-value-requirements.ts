import type {
  ProviderDefinition,
  ReleaseConfig,
  ReleasePlan,
  ReleaseRegistry,
} from "@pipelab/shared";
import type { WorkflowConnectionRequirement } from "@pipelab/workflow-runtime";

const environmentBindingPattern = /^\$\{\{\s*env\.([^\s{}]+)\s*\}\}$/;
const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ReleaseEnvironmentField = { key: string; type: string };
type ReleaseEnvironmentDefinition = { id: string; fields?: readonly ReleaseEnvironmentField[] };
export type ReleaseEnvironmentRegistry = {
  sources: readonly ReleaseEnvironmentDefinition[];
  producers: readonly (ReleaseEnvironmentDefinition & {
    targets: readonly ReleaseEnvironmentDefinition[];
  })[];
  destinations: readonly (ReleaseEnvironmentDefinition & {
    slotFields?: readonly ReleaseEnvironmentField[];
  })[];
};

interface WorkflowValueRequirements {
  connectionRequirements: WorkflowConnectionRequirement[];
  requiredEnvironmentVariables: string[];
}

interface ConnectionReference {
  alias: string;
  integration?: string;
  required: boolean;
}

export const getReleaseWorkflowEnvironmentVariableNames = (
  config: ReleaseConfig,
  registry: ReleaseEnvironmentRegistry,
): string[] => {
  const names = new Set<string>();
  const collectValue = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collectValue);
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(collectValue);
      return;
    }
    if (typeof value !== "string") return;
    const name = environmentBindingPattern.exec(value)?.[1];
    if (name && environmentVariableNamePattern.test(name)) names.add(name);
  };
  const collectFields = (
    fields: readonly ReleaseEnvironmentField[] | undefined,
    values: Record<string, unknown>,
  ) => {
    for (const field of fields ?? []) {
      if (field.type === "connection") continue;
      collectValue(values[field.key]);
    }
  };

  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  collectFields(source?.fields, config.source.config);
  for (const build of config.builds.filter((candidate) => candidate.enabled)) {
    const producer = registry.producers.find((candidate) => candidate.id === build.engine);
    collectFields(producer?.fields, build.config);
    for (const target of build.targets.filter((candidate) => candidate.enabled)) {
      const definition = producer?.targets.find((candidate) => candidate.id === target.id);
      collectFields(definition?.fields, target.config);
    }
  }
  for (const destination of config.destinations.filter((candidate) => candidate.enabled)) {
    const definition = registry.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    collectFields(definition?.fields, destination.config);
    for (const slot of destination.slots.filter((candidate) => candidate.enabled))
      collectFields(definition?.slotFields, slot.config);
  }
  return [...names];
};

const integrationForReference = (
  reference: ConnectionReference,
  providers: readonly Pick<ProviderDefinition, "id" | "integrations">[],
) => {
  const integration = reference.integration;
  if (!integration) {
    throw new Error(`Connection alias '${reference.alias}' has no provider schema.`);
  }

  const matchingProviders = providers.filter(
    (provider) =>
      provider.id === integration ||
      provider.integrations?.some((candidate) => candidate.name === integration),
  );
  if (matchingProviders.length !== 1) {
    throw new Error(
      `No provider Connection schema is registered for integration '${integration}'.`,
    );
  }

  const provider = matchingProviders[0];
  const namedIntegrations = provider.integrations?.filter(
    (candidate) => candidate.name === integration,
  );
  const definition =
    namedIntegrations?.length === 1
      ? namedIntegrations[0]
      : namedIntegrations?.length === 0 && provider.id === integration
        ? provider.integrations?.length === 1
          ? provider.integrations[0]
          : undefined
        : undefined;
  if (!definition) {
    throw new Error(
      `No unambiguous provider Connection schema is registered for integration '${integration}'.`,
    );
  }

  return {
    identity: `${provider.id}\u0000${definition.name}`,
    providerId: provider.id,
    definition,
  };
};

export const resolveWorkflowConnectionRequirements = (
  references: readonly ConnectionReference[],
  providers: readonly Pick<ProviderDefinition, "id" | "integrations">[],
): WorkflowConnectionRequirement[] => {
  const requirements = new Map<
    string,
    {
      identity: string;
      providerId: string;
      integrationName: string;
      required: boolean;
      fields: Map<string, { key: string; required: boolean }>;
    }
  >();

  for (const reference of references) {
    const { identity, providerId, definition } = integrationForReference(reference, providers);
    const existing = requirements.get(reference.alias);
    if (existing && existing.identity !== identity) {
      throw new Error(
        `Workflow Connection alias '${reference.alias}' is used for incompatible provider integrations.`,
      );
    }

    const requirement = existing ?? {
      identity,
      providerId,
      integrationName: definition.name,
      required: false,
      fields: new Map<string, { key: string; required: boolean }>(),
    };
    requirement.required ||= reference.required;
    requirement.providerId = providerId;
    requirement.integrationName = definition.name;
    for (const field of definition.fields) {
      requirement.fields.set(field.key, { key: field.key, required: true });
    }
    requirements.set(reference.alias, requirement);
  }

  return [...requirements].map(([alias, requirement]) => ({
    alias,
    required: requirement.required,
    fields: [...requirement.fields.values()],
    providerId: requirement.providerId,
    integrationName: requirement.integrationName,
  }));
};

export const getReleaseWorkflowValueRequirements = (
  config: ReleaseConfig,
  plan: ReleasePlan,
  registry: ReleaseRegistry,
  providers: readonly Pick<ProviderDefinition, "id" | "integrations">[],
): WorkflowValueRequirements => {
  const connectionReferences: ConnectionReference[] = [];
  const requiredEnvironmentVariables = new Set<string>();

  const collect = (
    fields: ReleaseRegistry["sources"][number]["fields"],
    values: Record<string, unknown>,
  ) => {
    for (const field of fields ?? []) {
      const value = values[field.key];
      if (field.type === "connection") {
        if (typeof value !== "string" || value.length === 0) continue;
        connectionReferences.push({
          alias: value,
          integration: field.integration,
          required: true,
        });
        continue;
      }

      if (!field.required || typeof value !== "string") continue;
      const environmentName = environmentBindingPattern.exec(value)?.[1];
      if (environmentName) requiredEnvironmentVariables.add(environmentName);
    }
  };

  const source = registry.sources.find((candidate) => candidate.id === config.source.provider);
  collect(source?.fields, config.source.config);

  for (const producer of plan.producers) {
    const definition = registry.producers.find((candidate) => candidate.id === producer.provider);
    collect(definition?.fields, producer.config);
    for (const target of producer.targets) {
      const targetDefinition = definition?.targets.find((candidate) => candidate.id === target.id);
      collect(targetDefinition?.fields, target.config);
    }
  }

  for (const destination of plan.destinations) {
    const definition = registry.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    collect(definition?.fields, destination.config);
    for (const slot of destination.slots) {
      if (slot.enabled) collect(definition?.slotFields, slot.config);
    }
  }

  return {
    connectionRequirements: resolveWorkflowConnectionRequirements(connectionReferences, providers),
    requiredEnvironmentVariables: [...requiredEnvironmentVariables],
  };
};
