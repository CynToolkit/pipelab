import { describe, expect, it } from "vitest";
import type { ProviderDefinition, ReleaseConfig, ReleaseRegistry } from "@pipelab/shared";
import type { Workflow, WorkflowValueResolver } from "@pipelab/workflow-runtime";
import type { ProviderServices } from "../workflow-tasks";
import { listPreflightDestinations, PreflightFailedError, runPreflights } from "./preflight";

const workflow: Workflow = {
  steps: [
    {
      id: "a",
      uses: "task:a",
      with: { accountConnectionId: "acct" },
      delivery: { destinationId: "d1", slotId: "s1", artifact: { stepId: "b", outputId: "o" } },
    },
    {
      id: "a2",
      uses: "task:a",
      with: { accountConnectionId: "acct" },
      delivery: { destinationId: "d1", slotId: "s2", artifact: { stepId: "b", outputId: "o" } },
    },
    {
      id: "c",
      uses: "task:c",
      delivery: { destinationId: "d2", slotId: "s1", artifact: { stepId: "b", outputId: "o" } },
    },
    { id: "build", uses: "task:build" },
  ],
} as unknown as Workflow;

const config = {
  destinations: [
    { id: "d1", provider: "dest.a", name: "Main", enabled: true, config: {}, slots: [] },
    { id: "d2", provider: "dest.c", enabled: true, config: {}, slots: [] },
  ],
} as unknown as ReleaseConfig;
const registry = {
  destinations: [
    { id: "dest.a", label: "Alpha" },
    { id: "dest.c", label: "Gamma" },
  ],
} as unknown as ReleaseRegistry;

const providers = (calls: string[]) =>
  [
    {
      preflights: {
        "task:a": async () => {
          calls.push("a");
          return { status: "failed", message: "key rejected" } as const;
        },
        "task:c": async () => {
          throw new Error("offline");
        },
      },
    },
  ] as unknown as readonly ProviderDefinition<ProviderServices>[];

const resolver = {
  connectionValues: {},
  resolveInputs: (step) => (step.with ?? {}) as Record<string, unknown>,
  redactString: (value: string) => value,
  redactObject: <T>(value: T) => value,
} as WorkflowValueResolver;

describe("destination preflight", () => {
  it("checks each account once, names destinations and treats a throwing check as unverifiable", async () => {
    const calls: string[] = [];
    const outcomes = await runPreflights({
      workflow,
      config,
      providers: providers(calls),
      registry,
      valueResolver: resolver,
      services: {} as ProviderServices,
    });
    expect(calls).toEqual(["a"]);
    expect(outcomes.map(({ destination, result }) => [destination, result.status])).toEqual([
      ["Alpha — Main", "failed"],
      ["Gamma", "unverifiable"],
    ]);
    expect(new PreflightFailedError(outcomes).message).toBe(
      "Preflight failed — nothing was run.\n• Alpha — Main: key rejected",
    );
  });

  it("lists the destinations a dry run would check", () => {
    expect(
      listPreflightDestinations({ workflow, config, providers: providers([]), registry }),
    ).toEqual(["Alpha — Main", "Gamma"]);
  });
});
