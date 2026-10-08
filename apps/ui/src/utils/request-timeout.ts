export const AUTH_REQUEST_TIMEOUT_MS = 15_000;

export const withRequestTimeout = <T>(
  request: Promise<T>,
  message: string,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutRequest = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([request, timeoutRequest]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
};
