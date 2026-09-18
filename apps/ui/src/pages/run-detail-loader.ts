export const loadRunEntryWithRetry = async <Entry>(
  read: () => Promise<Entry | undefined>,
  retries = 4,
  intervalMs = 250,
  shouldContinue: () => boolean = () => true,
): Promise<Entry | undefined> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (!shouldContinue()) return undefined;
    const entry = await read();
    if (!shouldContinue()) return undefined;
    if (entry !== undefined) return entry;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return undefined;
};
