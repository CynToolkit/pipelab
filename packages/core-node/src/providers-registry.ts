import { provider as constructProvider } from "@pipelab/plugin-construct";
import { provider as electronProvider } from "@pipelab/plugin-electron";
import { provider as godotProvider } from "@pipelab/plugin-godot";
import { provider as itchProvider } from "@pipelab/plugin-itch";
import { provider as pokiProvider } from "@pipelab/plugin-poki";
import { provider as steamProvider } from "@pipelab/plugin-steam";
import { provider as tauriProvider } from "@pipelab/plugin-tauri";
import type { ProviderDefinition } from "@pipelab/shared";
import type { PipelabPluginServices } from "./workflow-tasks";

/** The statically bundled providers shared by metadata, Release, and task setup. */
export const builtInProviders: ProviderDefinition<PipelabPluginServices>[] = [
  constructProvider,
  electronProvider,
  steamProvider,
  itchProvider,
  pokiProvider,
  tauriProvider,
  godotProvider,
];

export const assertUniqueProviderIds = <TServices>(
  providers: readonly ProviderDefinition<TServices>[],
): void => {
  const seen = new Set<string>();
  for (const provider of providers) {
    if (seen.has(provider.id)) {
      throw new Error(`Duplicate provider ID: ${provider.id}`);
    }
    seen.add(provider.id);
  }
};

assertUniqueProviderIds(builtInProviders);
