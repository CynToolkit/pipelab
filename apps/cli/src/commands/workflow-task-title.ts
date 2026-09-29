import type { WorkflowStep } from "@pipelab/workflow-runtime";

const providerNames: Record<string, string> = {
  construct: "Construct",
  electron: "Desktop app",
  itch: "itch.io",
  poki: "Poki",
  steam: "Steam",
};

const titleWords = (value: string) =>
  value
    .replace(/[:/_-]+/g, " ")
    .replace(/\bv\d+\b/gi, (version) => version.toUpperCase())
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

const providerFromUse = (uses: string) => {
  const packageName = uses.match(/\/plugin-([^/]+)/)?.[1]?.toLowerCase();
  return (
    (packageName && providerNames[packageName]) || (packageName ? titleWords(packageName) : "")
  );
};

export const workflowStepTitle = (step: Pick<WorkflowStep, "id" | "uses" | "delivery">) => {
  const useName = step.uses.split("/").at(-1) || step.id;
  const provider = providerFromUse(step.uses);

  if (step.delivery || /-destination-.+-(output|upload)$/.test(step.id)) {
    return provider ? `Upload to ${provider}` : "Upload release files";
  }

  if (useName === "export-construct-project") return "Export Construct project";
  if (useName === "unzip") return "Extract build files";
  if (useName.startsWith("electron:package")) {
    const target = step.id.match(/-(linux|windows|macos)-([^-]+)$/i);
    return target
      ? `Build desktop app (${titleWords(target[1])} ${target[2].toLowerCase()})`
      : "Build desktop app";
  }

  const readableUse = titleWords(useName);
  return readableUse || titleWords(step.id);
};
