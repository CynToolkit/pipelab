import { definePhases, type WorkflowTaskContext } from "./types";

const phases = definePhases([
  { id: "prepare", title: "Prepare" },
  { id: "install", title: "Install" },
]);

declare const context: WorkflowTaskContext;
const { phase } = context.withPhases(phases);

void phase("install", async ({ skip, success, fail, warn }) => {
  warn("Using a fallback");
  if (Math.random() > 0.5) return skip("Already installed");
  if (Math.random() > 0.5) fail("Install failed");
  return success("Dependencies ready");
});

// @ts-expect-error A phase ID must come from the bound catalog.
void phase("instal", () => undefined);

// @ts-expect-error A skipped result always includes an explanation.
void phase("prepare", ({ skip }) => skip());

// @ts-expect-error Failure requires a message or error.
void phase("prepare", ({ fail }) => fail());
