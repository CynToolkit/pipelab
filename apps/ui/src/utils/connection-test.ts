import type { PreflightResult } from "@pipelab/shared";

export interface TestedConnection {
  /** Fingerprint of the values the result was obtained for. */
  fingerprint: string;
  result: PreflightResult;
}

export type ConnectionSaveDecision =
  | { action: "save" }
  | { action: "test" }
  | { action: "block"; message: string };

/** Identifies the exact credentials a result belongs to, so any edit invalidates it. */
export const connectionTestFingerprint = (
  pluginName: string,
  values: Record<string, string | undefined>,
): string =>
  JSON.stringify([
    pluginName,
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key] ?? ""]),
  ]);

/**
 * Only a rejected credential blocks saving. Unverifiable (offline, timeout,
 * unsupported) saves, and untestable types save without a test.
 */
export const decideConnectionSave = (input: {
  testable: boolean;
  fingerprint: string;
  tested?: TestedConnection;
}): ConnectionSaveDecision => {
  if (!input.testable) return { action: "save" };
  if (!input.tested || input.tested.fingerprint !== input.fingerprint) return { action: "test" };
  const { result } = input.tested;
  return result.status === "failed"
    ? { action: "block", message: result.message }
    : { action: "save" };
};

/** The result to show for the current values, or nothing once they changed. */
export const currentConnectionTest = (
  fingerprint: string,
  tested?: TestedConnection,
): PreflightResult | undefined =>
  tested && tested.fingerprint === fingerprint ? tested.result : undefined;

export const connectionTestMessage = (result: PreflightResult): string =>
  result.status === "verified"
    ? "Connection verified"
    : result.status === "failed"
      ? result.message
      : result.reason;
