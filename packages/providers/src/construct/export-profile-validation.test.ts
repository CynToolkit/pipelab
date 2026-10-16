import { expect, test, vi } from "vitest";

const unreadableProfilePath = vi.hoisted(() => ({ value: "" }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();

  return {
    ...original,
    readdir: (...args: Parameters<typeof original.readdir>) => {
      if (String(args[0]) === unreadableProfilePath.value) {
        return Promise.reject(
          Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }),
        );
      }

      return original.readdir(...args);
    },
  };
});

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { preparePlaywrightProfile } from "./export-shared";

test("rejects a Construct profile whose directory contents cannot be read", async () => {
  const root = await mkdtemp(join("/tmp", "construct-profile-unreadable-"));
  const source = join(root, "profile");
  const destination = join(root, "destination");
  await mkdir(source);
  unreadableProfilePath.value = source;

  try {
    await expect(preparePlaywrightProfile(source, destination)).rejects.toThrow(
      /Could not read Construct browser profile .*EACCES/,
    );
  } finally {
    unreadableProfilePath.value = "";
    await rm(root, { recursive: true, force: true });
  }
});
