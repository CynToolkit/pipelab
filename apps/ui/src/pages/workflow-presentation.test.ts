import { describe, expect, it } from "vitest";
import { readableProviderId } from "./workflow-presentation";

describe("readableProviderId", () => {
  it("keeps the identity of unknown scoped providers while removing type suffixes", () => {
    expect(readableProviderId("@studio/pixel-factory/source")).toBe("Studio Pixel Factory");
  });

  it("removes the Pipelab plugin namespace for readable fallback names", () => {
    expect(readableProviderId("@pipelab/plugin-custom-export/destination")).toBe("Custom Export");
  });

  it("preserves an unrecognized identifier rather than rendering an empty label", () => {
    expect(readableProviderId("///")).toBe("///");
  });
});
