import { describe, expect, it } from "vitest";
import { constructSource } from "./index";

describe("Construct release validation", () => {
  it("reports source field paths", () => {
    expect(constructSource.validate({})).toEqual([
      expect.objectContaining({ path: "path" }),
      expect.objectContaining({ path: "profilePath" }),
    ]);
  });
});
