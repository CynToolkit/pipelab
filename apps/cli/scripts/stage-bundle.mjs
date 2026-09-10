import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliDist = resolve(cliRoot, "dist");
const uiDist = resolve(cliRoot, "../ui/dist");
const bundledUi = resolve(cliDist, "ui");
const assetsRoot = resolve(cliRoot, "../../assets");
const bundledAssets = resolve(cliDist, "assets");
const cliPackage = JSON.parse(await readFile(resolve(cliRoot, "package.json"), "utf8"));

await mkdir(cliDist, { recursive: true });
await rm(bundledUi, { recursive: true, force: true });
await cp(uiDist, bundledUi, { recursive: true });

await rm(bundledAssets, { recursive: true, force: true });
await mkdir(bundledAssets, { recursive: true });
for (const entry of await readdir(assetsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("asset-")) continue;
  await cp(resolve(assetsRoot, entry.name), resolve(bundledAssets, entry.name), {
    recursive: true,
  });
}

await writeFile(
  resolve(cliDist, "package.json"),
  `${JSON.stringify(
    {
      name: cliPackage.name,
      version: cliPackage.version,
      type: "module",
      main: "index.mjs",
      bin: {
        pipelab: "index.mjs",
        plab: "index.mjs",
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`[CLI] Staged UI from ${uiDist}`);
console.log(`[CLI] Staged asset templates from ${assetsRoot}`);
console.log(`[CLI] Wrote bundled manifest to ${resolve(cliDist, "package.json")}`);
