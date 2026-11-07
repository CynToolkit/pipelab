/** Maps a Construct source configuration to the inputs of the export-construct-project task. */
export const constructExportInputs = (sourceConfig: Record<string, unknown>) => {
  const accountConnectionId =
    typeof sourceConfig.accountConnectionId === "string" ? sourceConfig.accountConnectionId : "";
  return {
    file: String(sourceConfig.path || ""),
    customProfile: String(sourceConfig.profilePath || ""),
    version: String(sourceConfig.version || ""),
    ...(accountConnectionId ? { accountConnectionId } : {}),
  };
};
