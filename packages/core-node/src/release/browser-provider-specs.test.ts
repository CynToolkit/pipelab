import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBrowserProviderSpecs, renderBrowserProviderSpecs } from "./browser-provider-specs";

const artifactPath = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../apps/ui/src/generated/release-provider-specs.ts",
);

describe("browser provider specs", () => {
  it("matches the generated artifact to the current built-in registry", () => {
    expect(readFileSync(artifactPath, "utf8")).toBe(renderBrowserProviderSpecs());
  });

  it("contains only renderer-safe metadata and never guesses host availability", () => {
    const specs = buildBrowserProviderSpecs();
    const serialized = JSON.stringify(specs);
    const artifact = readFileSync(artifactPath, "utf8");

    expect(serialized).not.toMatch(/workflowTasks|compile\s*\(|isAvailable/);
    expect(artifact).not.toMatch(/@pipelab\/core-node|node:/);
    expect(artifact).not.toMatch(/workflowTasks|compile\s*\(|isAvailable/);
    expect(specs.providers.every((provider) => !("release" in provider))).toBe(true);
    const defaultConfigs = [
      ...specs.catalog.sources.map((source) => source.defaultConfig),
      ...specs.catalog.producers.flatMap((producer) => [
        producer.defaultConfig,
        ...producer.targets.map((target) => target.defaultConfig),
      ]),
      ...specs.catalog.destinations.map((destination) => destination.defaultConfig),
    ];
    for (const config of defaultConfigs)
      for (const [key, value] of Object.entries(config))
        if (/password|secret|token|credential|api.?key/i.test(key)) expect(value).toBe("");
    expect(
      specs.catalog.producers
        .flatMap((producer) => producer.targets)
        .some((target) => target.availabilityStatus === "unknown"),
    ).toBe(true);
    expect(
      specs.catalog.producers
        .flatMap((producer) => producer.targets)
        .filter((target) => target.availabilityStatus === "unknown")
        .every((target) => target.availability === undefined),
    ).toBe(true);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});
