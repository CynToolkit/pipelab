export interface ReleaseBuildPreferences {
  buildTypes: Record<
    string,
    {
      engine?: string;
      targets?: string[];
    }
  >;
}

export const DEFAULT_RELEASE_BUILD_PREFERENCES: ReleaseBuildPreferences = {
  buildTypes: {
    desktop: {
      engine: "@pipelab/plugin-electron/producer",
      targets: ["windows-x64"],
    },
  },
};

export const getReleaseBuildPreferences = (): ReleaseBuildPreferences =>
  DEFAULT_RELEASE_BUILD_PREFERENCES;
