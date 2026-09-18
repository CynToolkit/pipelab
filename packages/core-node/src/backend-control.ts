import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const BACKEND_CONTROL_FILE = "backend-control.json";
const STOP_PATH = "/_pipelab/stop";

export interface BackendControl {
  host: string;
  port: number;
  token: string;
}

const isBackendControl = (value: unknown): value is BackendControl => {
  if (!value || typeof value !== "object") return false;
  const control = value as Partial<BackendControl>;
  return typeof control.host === "string" &&
    typeof control.port === "number" && Number.isInteger(control.port) && control.port > 0 && control.port <= 65535 &&
    typeof control.token === "string" && control.token.length > 0;
};

const localHost = (host: string) =>
  host === "0.0.0.0" || host === "::" || host === "[::]" ? "127.0.0.1" : host;

const controlUrl = (control: BackendControl) => {
  const host = localHost(control.host);
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${formattedHost}:${control.port}${STOP_PATH}`;
};

const removeControlFile = async (path: string, token: string) => {
  try {
    const current = JSON.parse(await readFile(path, "utf8")) as Partial<BackendControl>;
    if (current.token === token) await rm(path, { force: true });
  } catch {
    // The server may already have removed the control file while shutting down.
  }
};

export async function stopLocalBackend(
  userDataPath: string,
  request: typeof fetch = fetch,
): Promise<boolean> {
  const controlPath = join(userDataPath, "config", BACKEND_CONTROL_FILE);
  let control: unknown;
  try {
    control = JSON.parse(await readFile(controlPath, "utf8"));
  } catch {
    return false;
  }

  if (!isBackendControl(control)) {
    await rm(controlPath, { force: true });
    return false;
  }

  let response: Response;
  try {
    response = await request(controlUrl(control), {
      method: "POST",
      headers: { authorization: `Bearer ${control.token}` },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    await removeControlFile(controlPath, control.token);
    return false;
  }

  if (response.status !== 202) {
    throw new Error(`The backend did not accept the stop request (HTTP ${response.status}).`);
  }

  await removeControlFile(controlPath, control.token);
  return true;
}
