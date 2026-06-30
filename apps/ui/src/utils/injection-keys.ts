import { InjectionKey } from "vue";
import { MigrationChannel } from "@pipelab/shared";

export const OpenMigrationModalKey: InjectionKey<(sourceChannel?: MigrationChannel) => void> =
  Symbol("openMigrationModal");

export const OpenUpgradeDialogKey: InjectionKey<() => void> =
  Symbol("openUpgradeDialog");
