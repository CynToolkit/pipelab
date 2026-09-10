import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  copyTreeWithoutSymlinks,
  isWithin,
  verifyBundledCli,
  verifyStageLinks,
} from "./run-forge-deployed.mjs";

async function temporaryDirectory(name) {
  return mkdtemp(path.join(tmpdir(), `pipelab-${name}-`));
}

test("isWithin accepts descendants and rejects sibling paths", () => {
  strictEqual(isWithin("/tmp/stage", "/tmp/stage/app"), true);
  strictEqual(isWithin("/tmp/stage", "/tmp/stage-other"), false);
});

test("copies an ordinary CLI tree and preserves file contents", async () => {
  const root = await temporaryDirectory("copy");
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  await mkdir(path.join(source, "ui"), { recursive: true });
  await writeFile(path.join(source, "index.mjs"), "export default true;\n");
  await writeFile(path.join(source, "ui", "index.html"), "<!doctype html>\n");

  await copyTreeWithoutSymlinks(source, target);

  deepStrictEqual(await readFile(path.join(target, "index.mjs"), "utf8"), "export default true;\n");
  deepStrictEqual(await readFile(path.join(target, "ui", "index.html"), "utf8"), "<!doctype html>\n");
});

test("rejects symlinks while copying the CLI", async (t) => {
  const root = await temporaryDirectory("copy-link");
  const source = path.join(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(path.join(root, "outside.mjs"), "export default false;\n");

  try {
    await symlink(path.join(root, "outside.mjs"), path.join(source, "index.mjs"));
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
      t.skip("creating symlinks is not permitted on this Windows runner");
      return;
    }
    throw error;
  }

  await rejects(copyTreeWithoutSymlinks(source, path.join(root, "target")), /symlink or junction/);
});

test("validates the embedded CLI entry points", async () => {
  const root = await temporaryDirectory("cli-layout");
  const cli = path.join(root, "cli");
  await mkdir(path.join(cli, "ui"), { recursive: true });
  await writeFile(path.join(cli, "package.json"), "{}\n");
  await writeFile(path.join(cli, "index.mjs"), "export default true;\n");
  await writeFile(path.join(cli, "ui", "index.html"), "<!doctype html>\n");

  await verifyBundledCli(cli);
});

test("rejects deployed links that escape the stage", async (t) => {
  const root = await temporaryDirectory("stage-link");
  const stage = path.join(root, "stage");
  await mkdir(path.join(stage, "node_modules"), { recursive: true });
  await mkdir(path.join(root, "outside"), { recursive: true });

  try {
    await symlink(path.join(root, "outside"), path.join(stage, "node_modules", "workspace-package"));
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
      t.skip("creating symlinks is not permitted on this Windows runner");
      return;
    }
    throw error;
  }

  await rejects(verifyStageLinks(stage), /points outside the stage/);
});
