import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromiumProfiles } from "./browser-profiles";

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
