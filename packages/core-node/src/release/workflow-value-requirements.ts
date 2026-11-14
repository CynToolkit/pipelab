import type {
  ProviderDefinition,
  ReleaseConfig,
  ReleaseHostContext,
  ReleasePlan,
  ReleaseRegistry,
} from "@pipelab/shared";
import { compileReleasePlan } from "@pipelab/shared";
import { collectEnvironmentReferences } from "@pipelab/workflow-runtime";
import { forEachUsedValue } from "@pipelab/shared";
import { planReleaseForHost } from "./plan-for-host";
import type { WorkflowConnectionRequirement } from "@pipelab/workflow-runtime";

const environmentBindingPattern = /^\$\{\{\s*env\.([^\s{}]+)\s*\}\}$/;
const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface WorkflowValueRequirements {
  connectionRequirements: WorkflowConnectionRequirement[];
  requiredEnvironmentVariables: string[];
}

interface ConnectionReference {
  alias: string;
  integration?: string;
  required: boolean;
}

/** Bindings in required fields: a run demands each to be set and non-empty. */
const requiredEnvironmentBindings = (
  config: ReleaseConfig,
  plan: ReleasePlan,
  registry: ReleaseRegistry,
): string[] => {
  const names = new Set<string>();
  forEachUsedValue(config, plan, registry, (field, value) => {
    if (field.type === "connection" || !field.required || typeof value !== "string") return;
    const name = environmentBindingPattern.exec(value)?.[1];
    if (name) names.add(name);
  });
  return [...names];
};

/**
 * Names of the `${{ env.NAME }}` references the workflow's run resolves, as the Desktop shell must
 * forward them. They come from the compiled workflow with the runtime's own parser, so they are
 * what the run demands: embedded references and every step input, plus required-field bindings. A workflow that
 * cannot be planned has nothing to forward; the run reports its issues.
 */
export const getReleaseWorkflowEnvironmentVariableNames = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  host: ReleaseHostContext,
): string[] => {
  const context = { host };
  const { config: resolved, plan } = planReleaseForHost(config, registry, context);
  if (plan.issues.some((issue) => issue.severity === "error")) return [];
  const referenced = collectEnvironmentReferences(
    compileReleasePlan(resolved, plan, registry, context),
  );
  // A run also demands every binding in a required field, even one no step input carries.
  return [
    ...new Set([...referenced, ...requiredEnvironmentBindings(resolved, plan, registry)]),
  ].filter((name) => environmentVariableNamePattern.test(name));
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
      fields: Map<string, { key: string; required: boolean; secret: boolean }>;
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
      fields: new Map<string, { key: string; required: boolean; secret: boolean }>(),
    };
    requirement.required ||= reference.required;
    requirement.providerId = providerId;
    requirement.integrationName = definition.name;
    for (const field of definition.fields) {
      requirement.fields.set(field.key, {
        key: field.key,
        required: true,
        secret: field.type === "password",
      });
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

  forEachUsedValue(config, plan, registry, (field, value) => {
    if (field.type !== "connection" || typeof value !== "string" || value.length === 0) return;
    connectionReferences.push({ alias: value, integration: field.integration, required: true });
  });

  return {
    connectionRequirements: resolveWorkflowConnectionRequirements(connectionReferences, providers),
    requiredEnvironmentVariables: requiredEnvironmentBindings(config, plan, registry),
  };
};
