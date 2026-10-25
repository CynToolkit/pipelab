import type { Data, ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";

const environmentReference = /\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

const workflowEnvironmentNames = (config: ReleaseConfig, catalog: ReleaseCatalog) => {
  const names = new Set<string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(collect);
      return;
    }
    if (typeof value !== "string") return;
    for (const match of value.matchAll(environmentReference)) names.add(match[1]!);
  };
  const collectFields = (
    values: Record<string, unknown>,
    fields: ReleaseCatalog["sources"][number]["fields"],
  ) => {
    const connectionFields = new Set(
      (fields || []).filter((field) => field.type === "connection").map((field) => field.key),
    );
    for (const [key, value] of Object.entries(values))
      if (!connectionFields.has(key)) collect(value);
  };

  const source = catalog.sources.find((candidate) => candidate.id === config.source.provider);
  collectFields(config.source.config, source?.fields);
  for (const build of config.builds.filter((candidate) => candidate.enabled)) {
    const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
    collectFields(build.config, producer?.fields);
    for (const target of build.targets.filter((candidate) => candidate.enabled)) {
      const definition = producer?.targets.find((candidate) => candidate.id === target.id);
      collectFields(target.config, definition?.fields);
    }
  }
  for (const destination of config.destinations.filter((candidate) => candidate.enabled)) {
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    collectFields(destination.config, definition?.fields);
    for (const slot of destination.slots.filter((candidate) => candidate.enabled))
      collectFields(slot.config, definition?.slotFields);
  }
  return [...names];
};

export const submitDesktopWorkflowExecution = async <Result>(input: {
  workflow: ReleaseConfig;
  catalog: ReleaseCatalog;
  request: Data<"workflow:execute">;
  readEnvironment: (
    names: string[],
  ) => Promise<Readonly<Record<string, string | undefined>>>;
  execute: (request: Data<"workflow:execute">) => Promise<Result>;
}) => {
  const names = workflowEnvironmentNames(input.workflow, input.catalog);
  const clientEnvironment = names.length ? await input.readEnvironment(names) : {};
  const env = Object.fromEntries(
    names.flatMap((name) =>
      Object.hasOwn(clientEnvironment, name) && clientEnvironment[name] !== undefined
        ? [[name, clientEnvironment[name]!]]
        : [],
    ),
  );
  return input.execute({ ...input.request, env });
};
