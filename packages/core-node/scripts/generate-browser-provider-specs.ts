import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildBrowserProviderSpecs,
  renderBrowserProviderSpecs,
} from "../src/release/browser-provider-specs";

const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/ui/src/generated/release-provider-specs.ts",
);
const output = renderBrowserProviderSpecs();

if (process.argv.includes("--check")) {
  let existing: unknown;
  try {
    ({ default: existing } = await import(pathToFileURL(outputPath).href));
  } catch {
    throw new Error(`Generated provider specs are missing: ${outputPath}`);
  }
  if (JSON.stringify(existing) !== JSON.stringify(buildBrowserProviderSpecs()))
    throw new Error("Browser provider specs are stale. Run the UI build to regenerate them.");
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
}
