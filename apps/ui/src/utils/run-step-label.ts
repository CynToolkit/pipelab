const KNOWN_TASKS: Record<string, string> = {
  passthrough: "Prepare source",
  "export-construct-project": "Export Construct project",
  "archive/unzip": "Extract archive",
  "godot:export": "Export Godot project",
  "steam-upload": "Upload to Steam",
  "fs/copy": "Copy to folder",
  "archive/zip": "Create ZIP archive",
};

const humanize = (value: string) => {
  const text = value
    .replace(/:v\d+$/, "")
    .replace(/[-_:/]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
};

const TARGETS: Array<[RegExp, string]> = [
  [/win(32|dows)?/i, "Windows"],
  [/linux/i, "Linux"],
  [/mac|darwin/i, "macOS"],
];

/** A readable label for a run step, derived from its task; falls back to the raw id. */
export const runStepLabel = (step: {
  id: string;
  name?: string;
  uses?: string;
  destinationName?: string;
}): string => {
  if (!step.uses) return step.name || step.id;
  const task = step.uses.replace(/^@pipelab\/(core|plugin-[^/]+)\//, "");
  const plugin = /^@pipelab\/plugin-([^/]+)\//.exec(step.uses)?.[1];
  let label =
    KNOWN_TASKS[task] ??
    (/package/.test(task) && plugin ? `Package with ${humanize(plugin)}` : humanize(task));
  const target = TARGETS.find(([pattern]) => pattern.test(step.id))?.[1];
  if (target) label += ` · ${target}`;
  if (step.destinationName) label += ` · ${step.destinationName}`;
  return label;
};
