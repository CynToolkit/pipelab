import { spawnSync } from "node:child_process";

if (!process.env.CONSTRUCT_CI_PROFILE_PATH) {
  throw new Error(
    "CONSTRUCT_CI_PROFILE_PATH must point to a populated disposable Construct profile.",
  );
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "-c",
    "tests/e2e/vitest.config.mts",
    "tests/e2e/tests/construct-electron-live.spec.ts",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
