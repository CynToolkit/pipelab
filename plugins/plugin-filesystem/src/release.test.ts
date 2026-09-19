import { describe, expect, it } from "vitest";
import { folderDestination, zipDestination } from "./index";

const artifact = { stepId: "build", artifact: "output" };
const destination = { id: "ship", provider: "filesystem", enabled: true, config: { outputDir: "/dist" }, slots: [] };

describe("filesystem release destinations", () => {
  it("maps a folder destination to fs copy input and output", () => {
    const [step] = folderDestination.compile(artifact, destination, { id: "folder", enabled: true, input: { producerId: "build", outputId: "output" }, config: {} }, { host: { platform: "linux", architecture: "x64" } });
    expect(step.artifactInputs).toEqual({ from: artifact });
    expect(step.with).toMatchObject({ to: "/dist", recursive: true, overwrite: true });
  });

  it("passes the final ZIP path to the ZIP runner", () => {
    const [step] = zipDestination.compile(artifact, { ...destination, config: { outputPath: "/dist/game.zip" } }, { id: "zip", enabled: true, input: { producerId: "build", outputId: "output" }, config: {} }, { host: { platform: "linux", architecture: "x64" } });
    expect(step.artifactInputs).toEqual({ folder: artifact });
    expect(step.with).toMatchObject({ outputPath: "/dist/game.zip" });
  });
});
