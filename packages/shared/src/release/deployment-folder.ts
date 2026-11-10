/** Folder name a Folder deployment writes into, derived from the deployment's display name. */
export const deploymentFolderName = (slot: { name?: string }, index: number): string => {
  const cleaned = trimEnd(
    (slot.name ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .trim()
      .replace(/^\.+/, ""),
    ". ",
  );
  return cleaned || `Deployment ${index + 1}`;
};

/** Removes any of `chars` from the end. A loop, not a regex: no backtracking on long runs. */
const trimEnd = (value: string, chars: string): string => {
  let end = value.length;
  while (end > 0 && chars.includes(value[end - 1]!)) end--;
  return value.slice(0, end);
};

/** The directory a Folder deployment is cleared and filled: a subfolder of the chosen output folder. */
export const deploymentFolderPath = (outputDir: string, name: string): string => {
  const separator = outputDir.includes("\\") && !outputDir.includes("/") ? "\\" : "/";
  return `${trimEnd(outputDir, "\\/")}${separator}${name}`;
};
