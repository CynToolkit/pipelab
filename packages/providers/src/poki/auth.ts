import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

/** Where the Poki CLI itself keeps its login: `$XDG_CONFIG_HOME/poki` (or `%LOCALAPPDATA%\\Poki`). */
export const pokiUserConfigRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  process.platform === "win32"
    ? env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    : env.XDG_CONFIG_HOME || join(homedir(), ".config");

/** Account names become directory names, so keep them to a safe, readable alphabet. */
export const normalizePokiAccountName = (account: string): string => {
  const name = account.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    throw new Error(
      "A Poki account name must be 1-64 letters, numbers, dots, dashes or underscores.",
    );
  }
  return name.toLowerCase();
};

/** Config root Pipelab manages for one named Poki account. */
export const pokiAccountConfigRoot = (thirdPartyPath: string, account: string): string =>
  join(thirdPartyPath, "poki-accounts", normalizePokiAccountName(account));

const pokiAuthDirectoryName = () => (process.platform === "win32" ? "Poki" : "poki");

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Finds the config root holding a Poki CLI login. A standard Poki CLI login is
 * used in place; a login saved earlier under Pipelab's third-party directory is
 * still honoured.
 */
export const findPokiConfigRoot = async (
  thirdPartyPath: string,
  account?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> => {
  const roots = account
    ? [pokiAccountConfigRoot(thirdPartyPath, account)]
    : [pokiUserConfigRoot(env), thirdPartyPath];
  for (const root of roots) {
    for (const directory of ["poki", "Poki"]) {
      if (await exists(join(root, directory, "auth.json"))) return root;
    }
  }
  return undefined;
};

const loginTimeoutMs = 5 * 60 * 1000;

type PokiAuthConfig = Record<string, unknown> & { access_token: string };

const parseAuthConfig = (value: unknown): PokiAuthConfig => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).access_token !== "string"
  ) {
    throw new Error("Poki sign-in did not return a usable authentication token.");
  }
  return value as PokiAuthConfig;
};

const exchangeToken = async (token: string): Promise<PokiAuthConfig> => {
  const response = await fetch("https://auth.poki.io/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exchange_token: token }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Poki sign-in token exchange failed (HTTP ${response.status}).`);
  }

  return parseAuthConfig(await response.json());
};

const openBrowser = (url: string) => {
  const command =
    process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.once("error", () => undefined);
  child.unref();
};

const writeAuthFile = async (configRoot: string, auth: PokiAuthConfig) => {
  const authDirectory = join(configRoot, pokiAuthDirectoryName());
  const authPath = join(authDirectory, "auth.json");
  const tempPath = join(authDirectory, `.auth-${randomUUID()}.tmp`);

  await mkdir(authDirectory, { recursive: true, mode: 0o700 });
  await chmod(authDirectory, 0o700);
  try {
    await writeFile(tempPath, JSON.stringify(auth), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(tempPath, 0o600);
    await rename(tempPath, authPath);
    await chmod(authPath, 0o600);
  } catch (error) {
    await rm(tempPath, { force: true }).catch((): undefined => undefined);
    throw error;
  }
};

/** Sign in through Poki's official browser flow and save a Poki CLI login without uploading: for a named account in Pipelab's managed directory, otherwise the standard one. */
export const loginToPoki = async (
  options: { thirdPartyPath?: string; account?: string } = {},
): Promise<void> => {
  if (options.account && !options.thirdPartyPath) {
    throw new Error("A Pipelab data directory is required to save a named Poki account.");
  }
  const configRoot = options.account
    ? pokiAccountConfigRoot(options.thirdPartyPath!, options.account)
    : pokiUserConfigRoot();
  let resolveAuth!: (value: PokiAuthConfig) => void;
  let rejectAuth!: (reason: Error) => void;
  let callbackHandled = false;
  let manualPrompt: ReturnType<typeof createInterface> | undefined;
  const authResult = new Promise<PokiAuthConfig>((resolve, reject) => {
    resolveAuth = resolve;
    rejectAuth = reject;
  });

  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "https://app.poki.dev");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Cache-Control", "no-store");

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "GET" && request.method !== "POST") {
      response.writeHead(405).end("Method not allowed");
      return;
    }
    if (callbackHandled) {
      response.writeHead(409).end("Sign-in callback already received");
      return;
    }

    const callbackUrl = new URL(request.url || "/", "http://localhost");
    if (callbackUrl.pathname !== "/" && callbackUrl.pathname !== "/favicon.ico") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (callbackUrl.pathname === "/favicon.ico") {
      response.writeHead(404).end();
      return;
    }
    const token = callbackUrl.searchParams.get("exchange_token");
    if (!token) {
      response.writeHead(400).end("Missing sign-in token");
      return;
    }

    callbackHandled = true;
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Poki sign-in completed. Return to the terminal.");
    server.close();
    void exchangeToken(token).then(resolveAuth, (error: unknown) => {
      rejectAuth(error instanceof Error ? error : new Error("Poki sign-in failed."));
    });
  });

  let timeout: NodeJS.Timeout | undefined;
  try {
    const address = await new Promise<{ port: number }>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "localhost", () => {
        const listeningAddress = server.address();
        if (!listeningAddress || typeof listeningAddress === "string") {
          reject(new Error("Could not start the local Poki sign-in callback."));
          return;
        }
        resolve({ port: listeningAddress.port });
      });
    });

    const callbackOrigin = `http://localhost:${address.port}`;
    const callbackUrl = callbackOrigin;
    const signInUrl = `https://app.poki.dev/signin/?cli=${encodeURIComponent(callbackUrl)}`;
    console.log(
      `Open this Poki sign-in link on a device with a browser:\n${signInUrl}\nAfter signing in, paste the final URL from the browser address bar here. This command only saves the login; it will not upload a build.`,
    );
    openBrowser(signInUrl);

    manualPrompt = createInterface({ input: process.stdin, output: process.stdout });
    void (async () => {
      while (!callbackHandled) {
        let pastedUrl: string;
        try {
          pastedUrl = await manualPrompt!.question("Final browser URL (paste here): ");
        } catch {
          return;
        }
        try {
          const parsedUrl = new URL(pastedUrl.trim());
          if (parsedUrl.origin !== callbackOrigin || parsedUrl.pathname !== "/") {
            throw new Error("Paste the final 127.0.0.1 return URL from the browser.");
          }
          const token = parsedUrl.searchParams.get("exchange_token");
          if (!token) throw new Error("The pasted URL does not contain a Poki sign-in token.");
          resolveAuth(await exchangeToken(token));
          return;
        } catch (error) {
          console.error(error instanceof Error ? error.message : "Could not read that return URL.");
        }
      }
    })();

    timeout = setTimeout(() => rejectAuth(new Error("Poki sign-in timed out.")), loginTimeoutMs);
    const auth = await authResult;
    await writeAuthFile(configRoot, auth);
  } finally {
    if (timeout) clearTimeout(timeout);
    manualPrompt?.close();
    server.close();
  }
};
