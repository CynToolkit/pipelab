import { describe, expect, it } from "vitest";
import { createCloudArtifactUploadMetadata } from "./pipelab-cloud";

describe("createCloudArtifactUploadMetadata", () => {
  it("sends the artifact slot as the Cloud worker output ID", () => {
    const metadata = createCloudArtifactUploadMetadata(
      {
        id: "artifact-build-1-0",
        artifact: "electron.windows",
        version: "1.4.0",
      },
      42,
      "a".repeat(64),
    );

    expect(metadata).toEqual({
      artifactId: "artifact-build-1-0",
      artifactOutputId: "electron.windows",
      version: "1.4.0",
      size: 42,
      checksum: "a".repeat(64),
    });
  });
});
