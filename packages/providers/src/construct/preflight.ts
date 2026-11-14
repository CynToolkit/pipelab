import type { ConnectionTestContext, PreflightContext, PreflightResult } from "@pipelab/shared";
import { failed, preflightSignal, unverifiable, verified } from "../preflight";
import { inspectChromiumProfile } from "./browser-profiles";

const LOGIN_URL = "https://account.construct.net/login.json";

/** Signs in with the account's credentials, which is the same request the export makes. Stores nothing. */
export const verifyConstructAccount = async (
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<PreflightResult> => {
  if (!username || !password) return failed("The Construct account has no username or password.");
  const form = new FormData();
  form.append("username", username);
  form.append("password", password);
  form.append("productType", "games");
  let response: Response;
  try {
    response = await fetch(LOGIN_URL, {
      method: "POST",
      body: form,
      signal: preflightSignal(signal),
    });
  } catch {
    return unverifiable("Construct could not be reached.");
  }
  if (!response.ok) return unverifiable(`Construct answered with HTTP ${response.status}.`);
  const body = (await response.json().catch((): null => null)) as {
    request?: { status?: unknown };
    response?: { userID?: unknown; token?: unknown };
  } | null;
  if (body?.request?.status === "ok" && body.response?.token) return verified();
  if (body?.request?.status) return failed("Construct rejected this username and password.");
  return unverifiable("Construct gave no definitive answer.");
};

/** Reads the browser profile's Construct session in a throwaway copy of the profile. */
export const verifyConstructProfile = async (
  profilePath: string,
  signal?: AbortSignal,
): Promise<PreflightResult> => {
  if (!profilePath) return failed("Choose a browser profile signed in to Construct.");
  const timeout = preflightSignal(signal);
  const inspection = await Promise.race([
    inspectChromiumProfile(profilePath),
    new Promise<undefined>((resolve) =>
      timeout.addEventListener("abort", () => resolve(undefined), { once: true }),
    ),
  ]);
  if (!inspection) return unverifiable("The browser profile could not be checked in time.");
  if (inspection.authStatus === "not-authenticated") {
    return failed("The browser profile is not signed in to Construct.");
  }
  if (inspection.authStatus === "authenticated") return verified();
  return unverifiable("Construct did not say whether the browser profile is signed in.");
};

export const checkConstructPreflight = async ({
  inputs,
  connectionValues,
  signal,
}: PreflightContext<unknown>): Promise<PreflightResult> => {
  const alias = String(inputs.accountConnectionId || "").trim();
  if (alias) {
    const account = connectionValues[alias];
    return verifyConstructAccount(
      String(account?.username ?? "").trim(),
      String(account?.password ?? ""),
      signal,
    );
  }
  const username = String(inputs.username ?? "").trim();
  const password = String(inputs.password ?? "");
  if (username && password) return verifyConstructAccount(username, password, signal);
  return verifyConstructProfile(String(inputs.customProfile ?? "").trim(), signal);
};

export const testConstructConnection = async ({
  values,
  signal,
}: ConnectionTestContext<unknown>): Promise<PreflightResult> =>
  verifyConstructAccount(
    String(values.username ?? "").trim(),
    String(values.password ?? ""),
    signal,
  );
