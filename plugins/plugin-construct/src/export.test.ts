import { expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preparePlaywrightProfile } from "./export-shared";

test("adds 1 + 2 to equal 3", async () => {
  const outputs: Record<string, unknown> = {};
  // await ExportActionRunner({
  //   inputs: {
  //     password: '123',
  //     headless: false,
  //     username: 'abc',
  //     version: '350',
  //     file: ''
  //   },
  //   log: (...args) => {
  //     console.log(...args)
  //   },
  //   setOutput: (key, value) => {
  //     outputs[key] = value
  //   },
  //   meta: {
  //     definition: ''
  //   },
  //   setMeta: () => {
  //     console.log('set meta defined here')
  //   },
  //   cwd: '',
  //   paths: {
  //     assets: '',
  //     unpack: ''
  //   },
  //   api: undefined,
  //   browserWindow
  // })
  console.log("outputs", outputs);
  expect(true).toBe(true);
}, 120_000);

test("copies the complete Construct profile and removes stale browser locks", async () => {
  const root = await mkdtemp(join("/tmp", "construct-profile-copy-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  const database = join(source, "IndexedDB", "https_editor.construct.net_0.indexeddb.leveldb");
  await mkdir(database, { recursive: true });
  await writeFile(join(source, "Preferences"), "profile metadata");
  await writeFile(join(database, "addon-record"), "pipelab");
  await writeFile(join(database, "LOCK"), "");

  try {
    await preparePlaywrightProfile(source, destination);

    expect(await readFile(join(destination, "Preferences"), "utf8")).toBe("profile metadata");
    expect(
      await readFile(
        join(
          destination,
          "IndexedDB",
          "https_editor.construct.net_0.indexeddb.leveldb",
          "addon-record",
        ),
        "utf8",
      ),
    ).toBe("pipelab");
    await expect(
      rm(join(destination, "IndexedDB", "https_editor.construct.net_0.indexeddb.leveldb", "LOCK")),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
