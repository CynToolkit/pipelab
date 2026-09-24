/** Stable IDs for core workflow tasks registered by Pipelab host packages. */
export const CORE_WORKFLOW_TASKS = {
  copy: "@pipelab/core/fs/copy",
  remove: "@pipelab/core/fs/remove",
  zip: "@pipelab/core/archive/zip",
  unzip: "@pipelab/core/archive/unzip",
  passthrough: "@pipelab/core/passthrough",
} as const;
