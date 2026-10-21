import type { ReleaseConfig, ReleasePlan, ReleaseRegistry } from "@pipelab/shared";
import type { WorkflowStep } from "@pipelab/workflow-runtime";
import type { ListrTask } from "listr2";
import { workflowStepTitle } from "./workflow-task-title";

export interface WorkflowStepTask {
  id: string;
  step: WorkflowStep;
  title: string;
}

const rendererOptions = {
  collapseErrors: false,
  collapseSubtasks: false,
  outputBar: 1,
  showErrorMessage: true,
};

const group = (title: string, tasks: ListrTask[]): ListrTask => ({
  title,
  rendererOptions,
  task: (_context, task) =>
    task.newListr(tasks, {
      concurrent: true,
      exitOnError: false,
      rendererOptions,
    }),
});

const providerPackage = (providerId: string) => providerId.split("/").slice(0, 2).join("/");

const stepMatchesProducer = (stepId: string, producerId: string) =>
  stepId === producerId ||
  stepId.startsWith(`${producerId}-`) ||
  stepId.includes(`-${producerId}-`) ||
  stepId.endsWith(`-${producerId}`);

const uniqueLabels = (labels: string[]) => {
  const counts = new Map<string, number>();
  return labels.map((label) => {
    const count = (counts.get(label) ?? 0) + 1;
    counts.set(label, count);
    return count === 1 ? label : `${label} ${count}`;
  });
};

export const createWorkflowTaskGroups = (
  steps: WorkflowStepTask[],
  config: ReleaseConfig,
  plan: ReleasePlan,
  registry: ReleaseRegistry,
  createStepTask: (step: WorkflowStepTask) => ListrTask,
): ListrTask[] => {
  const sourcePackage = providerPackage(config.source.provider);
  const sourceLabel =
    registry.sources.find((source) => source.id === config.source.provider)?.label ||
    config.source.provider;
  const producers = plan.producers.map((producer) => {
    const profile = config.builds.find((build) => build.id === producer.id);
    const definition = registry.producers.find((item) => item.id === producer.provider);
    return {
      producer,
      label: profile?.name?.trim() || definition?.label || producer.provider,
      tasks: [] as WorkflowStepTask[],
    };
  });

  const destinationDefinitions = config.destinations.filter((destination) => destination.enabled);
  const destinationLabels = uniqueLabels(
    destinationDefinitions.map(
      (destination) =>
        registry.destinations.find((item) => item.id === destination.provider)?.label ||
        destination.provider,
    ),
  );
  const destinations = new Map(
    destinationDefinitions.map((destination, index) => {
      const enabledSlots = destination.slots.filter((slot) => slot.enabled);
      const hasNamedSlot = destination.slots.some(
        (slot, slotIndex) =>
          slot.enabled &&
          Boolean(slot.name?.trim()) &&
          slot.name?.trim() !== `Deployment ${slotIndex + 1}`,
      );
      return [
        destination.id,
        {
          config: destination,
          label: destinationLabels[index],
          groupSlots: enabledSlots.length > 1 || hasNamedSlot,
          tasks: [] as WorkflowStepTask[],
        },
      ] as const;
    }),
  );

  const deliveryStart = steps.findIndex((item) => item.step.delivery !== undefined);
  const buildEnd = deliveryStart === -1 ? steps.length : deliveryStart;
  // Compiled releases list source steps before producers and deliveries.
  const producerStart = steps.findIndex(({ id, step }) => {
    if (step.delivery) return false;
    if (producers.some(({ producer }) => stepMatchesProducer(id, producer.id))) return true;
    return producers.some(
      ({ producer }) =>
        providerPackage(producer.provider) !== sourcePackage &&
        providerPackage(step.uses) === providerPackage(producer.provider),
    );
  });
  const sourceEnd = producerStart === -1 ? buildEnd : Math.min(producerStart, buildEnd);
  const sourceSteps = steps.slice(0, sourceEnd);
  const buildSteps = steps.slice(sourceEnd, buildEnd);

  for (const step of buildSteps) {
    const ownerById = producers.find(({ producer }) => stepMatchesProducer(step.id, producer.id));
    const providers = producers.filter(
      ({ producer }) => providerPackage(step.step.uses) === providerPackage(producer.provider),
    );
    const owner = ownerById || (providers.length === 1 ? providers[0] : undefined);
    if (owner) owner.tasks.push(step);
  }

  const otherBuildSteps = buildSteps.filter(
    (step) => !producers.some((producer) => producer.tasks.includes(step)),
  );

  for (const item of steps.slice(buildEnd)) {
    const delivery = item.step.delivery;
    if (!delivery) continue;
    let destination = destinations.get(delivery.destinationId);
    if (!destination) {
      destination = {
        config: {
          id: delivery.destinationId,
          provider: item.step.uses,
          enabled: true,
          config: {},
          slots: [],
        },
        label: workflowStepTitle(item.step).replace(/^Upload to /i, ""),
        groupSlots: false,
        tasks: [],
      };
      destinations.set(delivery.destinationId, destination);
    }

    const slot = destination.config.slots.find((candidate) => candidate.id === delivery.slotId);
    const slotIndex = destination.config.slots.findIndex(
      (candidate) => candidate.id === delivery.slotId,
    );
    const slotName = slot?.name?.trim();
    const defaultSlotName = `Deployment ${slotIndex + 1}`;
    const title = destination.groupSlots ? slotName || defaultSlotName : destination.label;
    destination.tasks.push({ ...item, title });
  }

  const taskGroups: ListrTask[] = [];
  if (sourceSteps.length) {
    taskGroups.push(group("Source", [group(sourceLabel, sourceSteps.map(createStepTask))]));
  }

  const matchingProducers = producers.filter((producer) => producer.tasks.length > 0);
  const producerLabels = uniqueLabels(matchingProducers.map((producer) => producer.label));
  const buildGroups = matchingProducers.map((producer, index) =>
    group(producerLabels[index], producer.tasks.map(createStepTask)),
  );
  if (otherBuildSteps.length) {
    buildGroups.push(group("Other build steps", otherBuildSteps.map(createStepTask)));
  }
  if (buildGroups.length) taskGroups.push(group("Build", buildGroups));

  const destinationTasks = [...destinations.values()].flatMap((destination) => {
    if (!destination.tasks.length) return [];
    const tasks = destination.tasks.map(createStepTask);
    return destination.groupSlots ? [group(destination.label, tasks)] : tasks;
  });
  if (destinationTasks.length) taskGroups.push(group("Destinations", destinationTasks));

  return taskGroups;
};
