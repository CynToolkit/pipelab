import type { ReleaseConfig } from "@pipelab/shared";

const PIPELAB_CLOUD_DESTINATION = "@pipelab/pipelab-cloud/destination";

/** Pipelab Cloud features exist only when the deployment configures a Cloud Worker. */
export const isPipelabCloudConfigured = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.PIPELAB_CLOUD_WORKER_URL?.trim());

/**
 * Turns off destinations this installation cannot reach, so a workflow saved
 * with Pipelab Cloud enabled neither plans nor runs it where Cloud is absent.
 */
export const withoutUnavailableDestinations = (
  config: ReleaseConfig,
  env: NodeJS.ProcessEnv = process.env,
): ReleaseConfig =>
  isPipelabCloudConfigured(env)
    ? config
    : {
        ...config,
        destinations: config.destinations.map((destination) =>
          destination.provider === PIPELAB_CLOUD_DESTINATION
            ? { ...destination, enabled: false }
            : destination,
        ),
      };
