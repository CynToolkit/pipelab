/** Host services needed by built-in providers; implemented by the CLI host. */
export interface ProviderHostContext {
  readonly releaseTag: string;
  getPackagesPath(...segments: string[]): string;
  getThirdPartyPath(...segments: string[]): string;
  getTempPath(...segments: string[]): string;
  createTempFolder(prefix?: string): Promise<string>;
  getCachePath(folder?: "pipelines" | "pacote", ...segments: string[]): string;
  getPnpmPath(...segments: string[]): string;
  getNodePath(version?: string): string;
  getConnectionsPath(): string;
  ensureNodeJS(): Promise<string>;
  ensurePNPM(): Promise<string>;
  resolveBundledAsset(packageName: string): Promise<string>;
}

/**
 * Provider-facing compatibility alias for ProviderHostContext.
 * This is a structural type, not the concrete PipelabContext class from core-node.
 */
export type PipelabContext = ProviderHostContext;

export * from "@pipelab/shared";

export const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
