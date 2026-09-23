import { describe, expect, it } from "vitest";
import { isSafePersistedId } from "./persisted-id";

describe("isSafePersistedId", () => {
  it.each([
    "../connections",
    "../../foo",
    "foo/bar",
    "foo\\bar",
    "/tmp/id",
    "C:\\tmp\\id",
    ".",
    "..",
    "",
    "   ",
    "bad<id",
    "bad>id",
    "bad:id",
    'bad"id',
    "bad|id",
    "bad?id",
    "bad*id",
    "name.",
    "name ",
    "CON",
    "con.txt",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "LPT9",
  ])("rejects unsafe id %j", (id) => expect(isSafePersistedId(id)).toBe(false));

  it.each(["V1StGXR8_Z5jdHi6B-myT", "workflow-1", "project name"])("accepts safe id %j", (id) =>
    expect(isSafePersistedId(id)).toBe(true),
  );
});
