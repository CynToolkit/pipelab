import fs from "node:fs";
import path from "node:path";

const assetsUiPath = "assets/ui";
const uiDistPath = "../ui/dist";

console.log("Cleaning assets/ui...");
fs.rmSync(assetsUiPath, { recursive: true, force: true });
fs.mkdirSync(assetsUiPath, { recursive: true });

if (fs.existsSync(uiDistPath)) {
  console.log("Copying UI dist to assets/ui...");
  fs.cpSync(uiDistPath, assetsUiPath, { recursive: true });
} else {
  console.error(`Error: UI distribution not found at ${uiDistPath}`);
  console.error("Please run 'pnpm build' in the apps/ui package first.");
  process.exit(1);
}
