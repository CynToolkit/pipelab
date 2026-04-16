import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    include: ["**/*.spec.ts"],
    root: "tests/e2e",
    environment: "node",
    reporters: process.env.GITHUB_ACTIONS
      ? ["hanging-process", "github-actions", "default"]
      : ["hanging-process", "default"],
  },
});
