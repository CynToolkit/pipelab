# Plan: Fix CLI Build and E2E Tests (Bundle `execa`)

## Goal

Fix the `ERR_REQUIRE_ESM` error that happens when running the CLI or `e2e` tests. Since `pkg` cannot parse or support dynamic ESM imports properly in its virtual filesystem without issues or warnings, the most robust solution is to **force the bundler (`tsdown`) to inline `execa`**.

By bundling `execa` into the `dist/index.cjs` file, all its ESM code will be transpiled into CommonJS by the bundler. `pkg` will then only see standard CommonJS code inside a single file, eliminating the runtime ES Module require error.

## Steps

1. **Modify `apps/cli/tsdown.config.ts`**:
   - Add the `deps: { alwaysBundle: ["execa"] }` configuration to tell `tsdown` to inline the `execa` dependency rather than keeping it external.
2. **Rebuild the CLI & Run E2E Tests**:
   - Run `pnpm --filter @pipelab/cli test:e2e` to verify the CLI builds successfully without externalizing `execa` and the tests pass.
