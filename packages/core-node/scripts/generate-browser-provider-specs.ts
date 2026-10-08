import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBrowserProviderSpecs } from "../src/release/browser-provider-specs";

const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/ui/src/generated/release-provider-specs.ts",
);
const output = renderBrowserProviderSpecs();

if (process.argv.includes("--check")) {
  let existing: string;
  try {
    existing = readFileSync(outputPath, "utf8");
  } catch {
    throw new Error(`Generated provider specs are missing: ${outputPath}`);
  }
  if (existing !== output)
    throw new Error("Browser provider specs are stale. Run the UI build to regenerate them.");
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
}
