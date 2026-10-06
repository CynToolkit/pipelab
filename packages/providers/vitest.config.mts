import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 1800000,
    hookTimeout: 60000,
    env: { NODE_ENV: "development", PIPELAB_DISABLE_HISTORY: "true" },
  },
});
