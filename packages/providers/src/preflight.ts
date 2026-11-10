import type { PreflightResult } from "@pipelab/shared";

/** A preflight must never hang a run: a slow answer is simply unknown. */
export const PREFLIGHT_TIMEOUT_MS = 8_000;

export const verified = (): PreflightResult => ({ status: "verified" });
export const unverifiable = (reason: string): PreflightResult => ({
  status: "unverifiable",
  reason,
});
export const failed = (message: string): PreflightResult => ({ status: "failed", message });

export const preflightSignal = (signal?: AbortSignal): AbortSignal =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS)])
    : AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS);
