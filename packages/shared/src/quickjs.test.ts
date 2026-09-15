import { describe, expect, test } from "vitest";
import { createQuickJs } from "./quickjs";

describe("createQuickJs", () => {
  test("evaluates code with the supplied parameters", async () => {
    const quickjs = await createQuickJs();

    expect(quickjs.run("params.value + 1", { params: { value: 41 } })).toBe(42);
  });
});
