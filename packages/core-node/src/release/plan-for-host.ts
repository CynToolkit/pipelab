import {
  planRelease,
  withoutHostUnavailableBuilds,
  type ReleaseConfig,
  type ReleasePlan,
  type ReleasePlanningContext,
  type ReleaseRegistry,
} from "@pipelab/shared";
import { withoutUnavailableDestinations } from "./unavailable-destinations";

/**
 * The one way a saved workflow is planned for this installation: Cloud and host-unavailable parts are
 * dropped first, exactly as a run does. Every consumer of "what does this workflow use" starts here.
 */
export const planReleaseForHost = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  context: ReleasePlanningContext,
): { config: ReleaseConfig; plan: ReleasePlan } => {
  const resolved = withoutHostUnavailableBuilds(
    withoutUnavailableDestinations(config),
    registry,
    context.host,
  );
  return { config: resolved, plan: planRelease(resolved, registry, context) };
};
