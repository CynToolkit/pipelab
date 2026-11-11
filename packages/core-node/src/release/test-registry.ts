import type { ReleaseRegistry } from "@pipelab/shared";
import { buildCoreReleaseRegistry } from "./registry";

/**
 * Registry for planning-topology tests that mix targets of several operating systems. Electron
 * and Tauri host rules (macOS needs a macOS host, Tauri needs its own platform) would make such a
 * scenario unplannable on any single host, so those rules are dropped here and covered by their
 * own tests.
 */
export const buildHostNeutralRegistry = (): ReleaseRegistry => {
  const registry = buildCoreReleaseRegistry();
  return {
    ...registry,
    producers: registry.producers.map((producer) =>
      /electron|tauri/.test(producer.id)
        ? {
            ...producer,
            targets: producer.targets.map(({ isAvailable: _isAvailable, ...target }) => target),
          }
        : producer,
    ),
  };
};
