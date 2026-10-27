// @vitest-environment jsdom
import { createApp, nextTick, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
  getCloudAccessToken: vi.fn(async () => "test-access-token"),
}));

vi.mock("@renderer/store/auth", () => ({ useAuth: () => authState }));

import CloudFilesPage from "./cloud-files.vue";

const artifact = (id: string, hasShareLink = false) => ({
  id,
  original_name: `${id}.zip`,
  artifact_output_id: "electron-build",
  project_id: "game-project",
  build_profile_id: "desktop-profile",
  build_target_id: "windows-x64",
  artifact_kind: "directory" as const,
  size: 1_572_864,
  uploaded_at: "2026-10-20T00:00:00.000Z",
  expires_at: "2026-11-19T00:00:00.000Z",
  pinned: true,
  hasShareLink,
});

const overview = (
  artifacts: ReturnType<typeof artifact>[],
  notifications: Array<{ id: string; message: string; deadline_at: string }> = [],
) => ({
  artifacts,
  usage: { usedBytes: 1_572_864, quotaBytes: 10 * 1024 * 1024, retentionDays: 30 },
  entitlement: { status: "active", graceUntil: null },
  notifications,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const mountedApps: App[] = [];
const mountedRoots: HTMLElement[] = [];

const mountPage = () => {
  const root = document.createElement("div");
  const app = createApp(CloudFilesPage);
  app.mount(root);
  mountedApps.push(app);
  mountedRoots.push(root);
  return root;
};

const settle = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const click = async (root: HTMLElement, label: string) => {
  const button = [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button, `button ${label}`).toBeDefined();
  button?.click();
  await settle();
};

afterEach(() => {
  while (mountedApps.length) mountedApps.pop()?.unmount();
  while (mountedRoots.length) mountedRoots.pop()?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  authState.user = { id: "user-1" };
  authState.getCloudAccessToken.mockResolvedValue("test-access-token");
});

describe("Cloud Files page", () => {
  it("lists only the owner's artifact data and pooled storage usage", async () => {
    vi.stubEnv("PIPELAB_CLOUD_WORKER_URL", "https://cloud.test");
    authState.user = { id: "user-1" };
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(overview([artifact("hosted-1")])),
    );
    vi.stubGlobal("fetch", fetchMock);

    const root = mountPage();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      action: "listArtifacts",
    });
    expect(root.querySelector('[aria-label="Cloud storage usage"]')?.textContent).toContain(
      "1.5 MB used",
    );
    expect(root.querySelector('[aria-label="Cloud storage usage"]')?.textContent).toContain(
      "of 10 MB",
    );
    expect(root.textContent).toContain("game-project");
    expect(root.textContent).toContain("desktop-profile");
    expect(root.textContent).toContain("windows-x64");
    expect(root.textContent).toContain("Latest release");
  });

  it("downloads, retrieves or creates a link, revokes it, and deletes the selected artifact", async () => {
    vi.stubEnv("PIPELAB_CLOUD_WORKER_URL", "https://cloud.test");
    authState.user = { id: "user-1" };
    let currentOverview = overview([artifact("hosted-new"), artifact("hosted-shared", true)]);
    const actions: Array<{ action: string; hostedArtifactId?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          action: string;
          hostedArtifactId?: string;
        };
        actions.push(request);
        switch (request.action) {
          case "listArtifacts":
            return jsonResponse(currentOverview);
          case "getArtifactDownloadUrl":
            return jsonResponse({ downloadUrl: "https://storage.test/short-lived" });
          case "getShareLink":
            return jsonResponse({
              shareUrl:
                request.hostedArtifactId === "hosted-shared"
                  ? "https://cloud.test/share/existing"
                  : null,
            });
          case "createShareLink":
            currentOverview = overview([
              artifact("hosted-new", true),
              artifact("hosted-shared", true),
            ]);
            return jsonResponse({ shareUrl: "https://cloud.test/share/new" });
          case "revokeShareLink":
            currentOverview = overview([
              artifact("hosted-new", false),
              artifact("hosted-shared", true),
            ]);
            return jsonResponse({ revoked: true });
          case "deleteArtifact":
            currentOverview = overview([artifact("hosted-shared", true)]);
            return jsonResponse({ deleted: true });
          default:
            return jsonResponse({ error: `Unexpected action: ${request.action}` }, 500);
        }
      }),
    );
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const root = mountPage();
    await settle();
    await click(root, "Download");
    expect(anchorClick).toHaveBeenCalled();
    expect(actions).toContainEqual({
      action: "getArtifactDownloadUrl",
      hostedArtifactId: "hosted-new",
    });

    await click(root, "Create share link");
    expect(root.querySelector("input[readonly]")).toHaveProperty(
      "value",
      "https://cloud.test/share/new",
    );
    expect(actions).toContainEqual({ action: "createShareLink", hostedArtifactId: "hosted-new" });

    await click(root, "Get link");
    expect(root.querySelector("#share-hosted-shared")).toHaveProperty(
      "value",
      "https://cloud.test/share/existing",
    );
    expect(actions).toContainEqual({ action: "getShareLink", hostedArtifactId: "hosted-shared" });

    await click(root, "Revoke link");
    expect(actions).toContainEqual({ action: "revokeShareLink", hostedArtifactId: "hosted-new" });

    await click(root, "Delete");
    expect(actions).toContainEqual({ action: "deleteArtifact", hostedArtifactId: "hosted-new" });
    expect(root.textContent).not.toContain("hosted-new.zip");
  });

  it("states the deadline and renewal or download options during grace", async () => {
    vi.stubEnv("PIPELAB_CLOUD_WORKER_URL", "https://cloud.test");
    authState.user = { id: "user-1" };
    const notice = {
      id: "notice-1",
      message:
        "Your Pipelab Cloud artifacts and share links will be deleted after November 2, 2026. Renew your plan to keep using Pipelab Cloud or download your artifacts before the deadline.",
      deadline_at: "2026-11-02T00:00:00.000Z",
    };
    const cloudOverview = {
      ...overview([artifact("hosted-1")], [notice]),
      entitlement: { status: "grace", graceUntil: notice.deadline_at },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse(cloudOverview)),
    );

    const root = mountPage();
    await settle();

    expect(root.querySelector('[aria-label="Cloud notices"]')?.textContent).toContain(
      "download your artifacts before the deadline",
    );
    expect(root.querySelector(".grace-copy")?.textContent).toContain(
      "Download existing files or renew",
    );
    expect(root.textContent).toContain("November 2, 2026");
  });

  it("exposes sign-in, loading, empty, and request-error states accessibly", async () => {
    vi.stubEnv("PIPELAB_CLOUD_WORKER_URL", "https://cloud.test");
    authState.user = null;
    const unauthenticatedFetch = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", unauthenticatedFetch);
    const signedOutRoot = mountPage();
    await settle();
    expect(signedOutRoot.querySelector('[role="status"]')?.textContent).toContain("Sign in");
    expect(unauthenticatedFetch).not.toHaveBeenCalled();

    mountedApps.pop()?.unmount();
    signedOutRoot.remove();
    mountedRoots.pop();
    authState.user = { id: "user-1" };
    let resolveList!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveList = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => pendingResponse),
    );
    const loadingRoot = mountPage();
    await settle();
    expect(loadingRoot.querySelector('[role="status"]')?.textContent).toContain("Loading");
    resolveList(jsonResponse(overview([])));
    await settle();
    expect(loadingRoot.textContent).toContain("No hosted artifacts yet");

    mountedApps.pop()?.unmount();
    loadingRoot.remove();
    mountedRoots.pop();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ error: "Cloud request unavailable" }, 503)),
    );
    const errorRoot = mountPage();
    await settle();
    expect(errorRoot.querySelector('[role="alert"]')?.textContent).toContain(
      "Cloud request unavailable",
    );
  });
});
