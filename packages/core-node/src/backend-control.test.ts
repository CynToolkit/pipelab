import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKEND_CONTROL_FILE, stopLocalBackend } from "./backend-control";

const roots: string[] = [];
const createControl = async (control: unknown) => {
  const root = await mkdtemp(join(tmpdir(), "pipelab-backend-control-"));
  roots.push(root);
  const configDir = join(root, "config");
  await mkdir(configDir);
  await writeFile(join(configDir, BACKEND_CONTROL_FILE), JSON.stringify(control));
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe("stopLocalBackend", () => {
  it("requests a stop from the recorded local server and clears its control file", async () => {
    const root = await createControl({ host: "0.0.0.0", port: 33753, token: "local-secret" });
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await expect(stopLocalBackend(root, request)).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith("http://127.0.0.1:33753/_pipelab/stop", expect.objectContaining({
      method: "POST",
      headers: { authorization: "Bearer local-secret" },
    }));
    await expect(readFile(join(root, "config", BACKEND_CONTROL_FILE))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports no backend when no control file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "pipelab-backend-control-"));
    roots.push(root);
    const request = vi.fn();

    await expect(stopLocalBackend(root, request)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("removes stale control data when its server is unreachable", async () => {
    const root = await createControl({ host: "127.0.0.1", port: 33753, token: "local-secret" });
    const request = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(stopLocalBackend(root, request)).resolves.toBe(false);
    await expect(readFile(join(root, "config", BACKEND_CONTROL_FILE))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
