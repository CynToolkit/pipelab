import type {
  PreflightCheck,
  PreflightResult,
  ProviderDefinition,
  ReleaseConfig,
  ReleaseRegistry,
} from "@pipelab/shared";
import type { Workflow, WorkflowValueResolver } from "@pipelab/workflow-runtime";
import type { ProviderServices } from "../workflow-tasks";

export interface PreflightOutcome {
  stepId: string;
  destinationId: string;
  destination: string;
  result: PreflightResult;
}

/** Raised when a destination is definitively unusable, before any step has started. */
export class PreflightFailedError extends Error {
  constructor(readonly outcomes: readonly PreflightOutcome[]) {
    const failures = outcomes.filter((outcome) => outcome.result.status === "failed");
    super(
      [
        "Preflight failed — nothing was run.",
        ...failures.map(
          (outcome) =>
            `• ${outcome.destination}: ${outcome.result.status === "failed" ? outcome.result.message : ""}`,
        ),
      ].join("\n"),
    );
    this.name = "PreflightFailedError";
  }
}

const preflightRegistry = (providers: readonly ProviderDefinition<ProviderServices>[]) => {
  const checks: Record<string, PreflightCheck<ProviderServices>> = {};
  for (const provider of providers) Object.assign(checks, provider.preflights);
  return checks;
};

interface PreflightTarget {
  step: Workflow["steps"][number];
  destinationId: string;
  destination: string;
  check: PreflightCheck<ProviderServices>;
}

interface PreflightScope {
  workflow: Workflow;
  config: ReleaseConfig;
  providers: readonly ProviderDefinition<ProviderServices>[];
  registry: ReleaseRegistry;
}

const preflightTargets = ({ workflow, config, providers, registry }: PreflightScope) => {
  const checks = preflightRegistry(providers);
  const seen = new Set<string>();
  const targets: PreflightTarget[] = [];
  for (const step of workflow.steps) {
    const check = checks[step.uses];
    if (!check || !step.delivery) continue;
    // Checks depend on the account, so slots sharing one account share the call.
    const key = `${step.uses}\0${String(step.with?.accountConnectionId ?? step.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const destinationId = step.delivery.destinationId;
    const configured = config.destinations.find((candidate) => candidate.id === destinationId);
    const label =
      registry.destinations.find((candidate) => candidate.id === configured?.provider)?.label ??
      destinationId;
    targets.push({
      step,
      check,
      destinationId,
      destination: configured?.name ? `${label} — ${configured.name}` : label,
    });
  }
  return targets;
};

/** Destinations a real run would check first, for `--dry-run` to report without checking them. */
export const listPreflightDestinations = (scope: PreflightScope): string[] =>
  preflightTargets(scope).map((target) => target.destination);

/**
 * Runs every destination's read-only preflight in parallel. Checks that throw
 * or cannot resolve their inputs count as unverifiable; they never block.
 */
export const runPreflights = async ({
  valueResolver,
  services,
  signal,
  ...scope
}: PreflightScope & {
  valueResolver: WorkflowValueResolver;
  services: ProviderServices;
  signal?: AbortSignal;
}): Promise<PreflightOutcome[]> =>
  Promise.all(
    preflightTargets(scope).map(
      async ({ step, check, destinationId, destination }): Promise<PreflightOutcome> => {
        const base = { stepId: step.id, destinationId, destination };
        try {
          const result = await check({
            inputs: valueResolver.resolveInputs(step, {}),
            connectionValues: valueResolver.connectionValues,
            services,
            signal,
          });
          return { ...base, result };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          return {
            ...base,
            result: { status: "unverifiable", reason: valueResolver.redactString(reason) },
          };
        }
      },
    ),
  );
