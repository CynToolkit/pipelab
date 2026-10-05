import type { ProviderDefinition } from "@pipelab/shared";
import type { ProviderServices, WorkflowTaskFactoryRegistry } from "../workflow-tasks";
import { builtInProviders, assertUniqueProviderIds } from "../providers-registry";

export const createBuiltInWorkflowTaskFactories = (
  providers: readonly ProviderDefinition<ProviderServices>[] = builtInProviders,
): WorkflowTaskFactoryRegistry => {
  assertUniqueProviderIds(providers);

  const factories: WorkflowTaskFactoryRegistry = {};
  for (const provider of providers) {
    for (const [taskId, createTask] of Object.entries(provider.workflowTasks ?? {})) {
      if (Object.hasOwn(factories, taskId)) {
        throw new Error(`Duplicate workflow task ID: ${taskId}`);
      }
      factories[taskId] = createTask;
    }
  }

  return factories;
};

/** Native Workflow tasks keyed by the stable IDs emitted by Release providers. */
export const workflowTaskFactories: WorkflowTaskFactoryRegistry =
  createBuiltInWorkflowTaskFactories();
