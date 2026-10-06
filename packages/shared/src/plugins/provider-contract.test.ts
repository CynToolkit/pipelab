import { describe, expect, it } from "vitest";
import type {
  ReleaseDestinationDefinition,
  ReleaseProducerDefinition,
  ReleaseSourceDefinition,
} from "../release/types";
import { createProviderDefinition, type ProviderDefinition } from "./definitions";

interface FakeWorkflowServices {
  workspacePath: string;
}

const source: ReleaseSourceDefinition = {
  id: "@example/provider/source",
  label: "Example source",
  output: { kind: "project", technology: "example", container: "directory" },
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({
    steps: [],
    artifact: {
      reference: { stepId: "source", artifact: "output" },
      descriptor: { kind: "project", technology: "example", container: "directory" },
    },
  }),
};

const producer: ReleaseProducerDefinition = {
  id: "@example/provider/producer",
  label: "Example producer",
  accepts: { kind: "project" },
  planning: { mode: "build" },
  targets: [],
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => ({ steps: [], artifacts: {} }),
};

const destination: ReleaseDestinationDefinition = {
  id: "@example/provider/destination",
  label: "Example destination",
  accepts: { kind: "application" },
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: () => [],
};

const createProvider = (id: string) =>
  createProviderDefinition({
    id,
    packageName: id,
    name: "Example provider",
    description: "A provider contract fixture",
    icon: { type: "icon", icon: "pi-box" },
    isOfficial: false,
    integrations: [
      { name: "Example account", fields: [{ key: "token", label: "Token", type: "password" }] },
    ],
    release: { sources: [source], producers: [producer], destinations: [destination] },
    workflowTasks: {
      "@example/provider/task":
        (services: FakeWorkflowServices) =>
        async ({ services: taskServices }) => ({
          workspacePath: taskServices.workspacePath,
          configuredPath: services.workspacePath,
        }),
    },
  });

describe("provider contract", () => {
  it("preserves supplied workflow tasks as a required concrete registry", () => {
    const provider = createProvider("@example/provider");

    expect(Object.keys(provider.workflowTasks)).toEqual(["@example/provider/task"]);
    expect(
      provider.workflowTasks["@example/provider/task"]({ workspacePath: "/workspace" }),
    ).toBeTypeOf("function");
  });

  it("combines renderer metadata, integrations, Release contributions, and native tasks", () => {
    const provider: ProviderDefinition<FakeWorkflowServices> = createProvider("@example/provider");

    expect(provider).toMatchObject({
      id: "@example/provider",
      integrations: [{ name: "Example account" }],
      release: {
        sources: [expect.objectContaining({ id: source.id })],
        producers: [expect.objectContaining({ id: producer.id })],
        destinations: [expect.objectContaining({ id: destination.id })],
      },
      workflowTasks: { "@example/provider/task": expect.any(Function) },
    });
  });
});
