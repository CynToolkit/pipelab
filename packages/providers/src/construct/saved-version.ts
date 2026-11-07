import StreamZip from "node-stream-zip";

/** `savedWithRelease` is `release * 100 + patch`, e.g. 46602 is r466-2 and 50600 is r506. */
export const formatSavedConstructVersion = (savedWithRelease: unknown): string | undefined => {
  if (typeof savedWithRelease !== "number" || !Number.isSafeInteger(savedWithRelease)) {
    return undefined;
  }

  const release = Math.floor(savedWithRelease / 100);
  if (release <= 0) return undefined;

  const patch = savedWithRelease % 100;
  return `r${release}${patch > 0 ? `-${patch}` : ""}`;
};

/** Reads the Construct release a `.c3p` was saved with, without extracting the archive. */
export const getSavedConstructVersion = async (file: string): Promise<string | undefined> => {
  // Construct archives created on Windows can contain backslashes in entry
  // names; we only read the fixed root project.c3proj entry and never extract.
  const archive = new StreamZip.async({ file, skipEntryNameValidation: true });
  try {
    const projectEntry = await archive.entry("project.c3proj");
    if (!projectEntry || projectEntry.isDirectory) return undefined;

    const project: unknown = JSON.parse((await archive.entryData(projectEntry)).toString("utf8"));
    if (!project || typeof project !== "object" || !("savedWithRelease" in project)) {
      return undefined;
    }

    return formatSavedConstructVersion(project.savedWithRelease);
  } catch {
    return undefined;
  } finally {
    await archive.close().catch(() => {});
  }
};
