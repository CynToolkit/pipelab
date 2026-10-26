import { createProviderDefinition } from "@pipelab/shared";
import type { ReleaseDestinationDefinition } from "@pipelab/shared";

export const PIPELAB_CLOUD_UPLOAD_TASK_ID = "pipelab-cloud:upload";

export const pipelabCloudDestination: ReleaseDestinationDefinition = {
  id: "@pipelab/pipelab-cloud/destination",
  label: "Pipelab Cloud",
  description: "Store selected build artifacts in your private Pipelab Cloud storage.",
  accepts: { kind: "application", container: ["file", "directory", "archive"] },
  createDefaultConfig: () => ({}),
  validate: () => [],
  compile: (artifact, destination, slot) => {
    const input = slot.input;
    if (!input || "source" in input) {
      throw new Error("Pipelab Cloud requires an output from a Build Profile.");
    }

    return [
      {
        id: `pipelab-cloud-${destination.id}-${slot.id}`,
        uses: PIPELAB_CLOUD_UPLOAD_TASK_ID,
        needs: [artifact.reference.stepId],
        artifactInputs: { input: artifact.reference },
        with: {
          buildProfileId: input.producerId,
          buildTargetId: input.outputId,
        },
        delivery: { destinationId: destination.id, slotId: slot.id, artifact: artifact.reference },
      },
    ];
  },
};

export const provider = createProviderDefinition({
  id: "@pipelab/pipelab-cloud",
  packageName: "@pipelab/providers",
  name: "Pipelab Cloud",
  description: "Store and share selected Pipelab build artifacts.",
  icon: { type: "icon", icon: "mdi-cloud-upload-outline" },
  isOfficial: true,
  release: { destinations: [pipelabCloudDestination] },
});

export default provider;
