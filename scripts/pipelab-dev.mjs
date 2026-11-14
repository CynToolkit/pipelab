#!/usr/bin/env node
// Runs the Pipelab CLI from source in development mode: `pnpm pipelab <command>`.
// The workspace sources are bundled once with esbuild (node_modules stay external) and the bundle is
// reused until a source file changes, because transpiling the whole workspace on every launch with
// tsx takes several seconds.
import { build } from "esbuild";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "apps/cli/src/index.ts");
// Next to the entry, so paths the CLI derives from its own location match a source run.
const outfile = resolve(root, "apps/cli/src/index.dev.mjs");
const inputsFile = `${outfile}.inputs.json`;

const upToDate = () => {
  if (!existsSync(outfile) || !existsSync(inputsFile)) return false;
  const builtAt = statSync(outfile).mtimeMs;
  try {
    return JSON.parse(readFileSync(inputsFile, "utf8")).every((file) => {
      try {
        return statSync(resolve(root, file)).mtimeMs <= builtAt;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};

if (!upToDate()) {
  const started = Date.now();
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: "linked",
    metafile: true,
    logLevel: "error",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    plugins: [
      {
        name: "external-dependencies",
        setup(pluginBuild) {
          // Bundle the workspace (@pipelab/*); load every other package from node_modules.
          pluginBuild.onResolve({ filter: /^[^./]/ }, (args) =>
            args.path.startsWith('@pipelab/') ||
            args.path.startsWith("node:") ||
            /^[a-z]:/i.test(args.path)
              ? undefined
              : { path: args.path, external: true },
          );
        },
      },
    ],
  });
  writeFileSync(
    inputsFile,
    JSON.stringify(
      Object.keys(result.metafile.inputs).filter((file) => !file.includes("node_modules")),
    ),
  );
  console.error(`[pipelab] Bundled the CLI in ${Date.now() - started}ms`);
}

process.env.NODE_ENV = "development";
process.setSourceMapsEnabled(true);
await import(pathToFileURL(outfile).href);
