import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: true,
    testTimeout: 1800000,
    hookTimeout: 60000,
    maxWorkers: 2,
    include: ["**/*.spec.ts"],
    root: "tests/e2e",
    environment: "node",
    env: { NODE_ENV: "development", PIPELAB_DISABLE_HISTORY: "true" },
  },
});
