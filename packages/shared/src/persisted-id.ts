/** IDs used as persisted filenames or directory components. */
export const isSafePersistedId = (value: unknown): value is string => {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim())
    return false;
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\")) return false;
  if ([...value].some((character) => character.charCodeAt(0) <= 0x1f)) return false;
  if (/^[A-Za-z]:/.test(value) || value.startsWith("\\")) return false;
  return true;
};

export const persistedIdIssue = (field: string) =>
  `${field} must be a safe non-empty persisted ID.`;
