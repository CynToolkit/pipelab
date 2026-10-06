import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromiumProfiles, detectConstructAuthStatusFromResponse } from "./browser-profiles";

test("discovers a nested Chromium profile as its own exact selection", async () => {
  const root = await mkdtemp(join("/tmp", "construct-nested-profile-"));
  const userData = join(root, "PipelabConstruct");
  const profile = join(userData, "Default");
  try {
    await mkdir(profile, { recursive: true });
    await writeFile(
      join(root, "Local State"),
      JSON.stringify({ profile: { info_cache: { PipelabConstruct: { name: "PipelabConstruct" } } } }),
    );
    await writeFile(
      join(userData, "Local State"),
      JSON.stringify({ profile: { info_cache: { Default: { name: "Your Chromium" } } } }),
    );
    await writeFile(join(userData, "Preferences"), "outer metadata");
    await writeFile(join(profile, "Preferences"), "selected profile metadata");

    expect(await chromiumProfiles(root)).toEqual([
      { path: join("PipelabConstruct", "Default"), name: "Your Chromium" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  ["https://account.construct.net/login.json", 200, { request: { status: "ok" }, response: { userID: 123, token: "session" } }, "authenticated"],
  ["https://account.construct.net/account.json", 200, { request: { status: "ok" }, response: { userID: 123 } }, "authenticated"],
  ["https://account.construct.net/login.json", 200, { request: { status: "error" } }, "not-authenticated"],
  ["https://account.construct.net/login.json", 401, null, "not-authenticated"],
  ["https://editor.construct.net/", 200, { request: { status: "ok" } }, "unknown"],
  ["not a URL", 200, null, "unknown"],
] as const)("reports Construct auth status from login response %s", (url, status, payload, expected) => {
  expect(detectConstructAuthStatusFromResponse(url, status, payload)).toBe(expected);
});
