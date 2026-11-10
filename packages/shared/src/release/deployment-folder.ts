/** Folder name a Folder deployment writes into, derived from the deployment's display name. */
export const deploymentFolderName = (slot: { name?: string }, index: number): string => {
  const cleaned = (slot.name ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  return cleaned || `Deployment ${index + 1}`;
};

/** The directory a Folder deployment is cleared and filled: a subfolder of the chosen output folder. */
export const deploymentFolderPath = (outputDir: string, name: string): string => {
  const separator = outputDir.includes("\\") && !outputDir.includes("/") ? "\\" : "/";
  return `${outputDir.replace(/[\\/]+$/, "")}${separator}${name}`;
};
