import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    include: ["**/*.spec.ts"],
    root: "tests/e2e",
    environment: "node",
  },
});
