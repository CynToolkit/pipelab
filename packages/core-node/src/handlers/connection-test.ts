import type { PreflightResult, ProviderDefinition } from "@pipelab/shared";
import type { PipelabContext } from "../context";
import type { ProviderServices } from "../workflow-tasks";

export const CONNECTION_TEST_TIMEOUT_MS = 12_000;

const REDACTION = "***";

const redact = (text: string, values: Record<string, string>): string => {
  let result = text;
  for (const value of Object.values(values)) {
    const secret = value.trim();
    if (secret.length >= 4) result = result.split(secret).join(REDACTION);
  }
  return result;
};

const redactResult = (result: PreflightResult, values: Record<string, string>): PreflightResult => {
  if (result.status === "failed")
    return { status: "failed", message: redact(result.message, values) };
  if (result.status === "unverifiable")
    return { status: "unverifiable", reason: redact(result.reason, values) };
  return result;
};

/**
 * Runs a provider's read-only credential check for one connection. Never
 * throws: unsupported types, timeouts and crashes are all `unverifiable`.
 */
export const testConnection = async (
  providers: readonly ProviderDefinition<ProviderServices>[],
  context: PipelabContext,
  request: { pluginName: string; values: Record<string, string> },
  timeoutMs = CONNECTION_TEST_TIMEOUT_MS,
): Promise<PreflightResult> => {
  const values = request.values ?? {};
  const test = providers.find((provider) => provider.connectionTests?.[request.pluginName])
    ?.connectionTests?.[request.pluginName];
  if (!test) return { status: "unverifiable", reason: "This connection type cannot be tested." };

  const signal = AbortSignal.timeout(timeoutMs);
  const timedOut = new Promise<PreflightResult>((resolve) =>
    signal.addEventListener(
      "abort",
      () => resolve({ status: "unverifiable", reason: "The connection test timed out." }),
      { once: true },
    ),
  );
  try {
    // The connection tests only use `context`; the other run-scoped services do not exist here.
    const services = { context } as ProviderServices;
    return redactResult(await Promise.race([test({ values, services, signal }), timedOut]), values);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "unverifiable", reason: redact(reason, values) || "The test failed." };
  }
};
