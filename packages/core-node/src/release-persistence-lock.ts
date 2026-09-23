const mutationTails = new Map<string, Promise<void>>();

export const serializeReleaseMutation = async <T>(
  key: string,
  mutation: () => Promise<T>,
): Promise<T> => {
  const previous = mutationTails.get(key) || Promise.resolve();
  const current = previous.catch((): void => undefined).then(mutation);
  const tail = current.then(
    (): void => undefined,
    (): void => undefined,
  );
  mutationTails.set(key, tail);
  try {
    return await current;
  } finally {
    if (mutationTails.get(key) === tail) mutationTails.delete(key);
  }
};
