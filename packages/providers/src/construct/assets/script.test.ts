import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import {
  clickConstructDownload,
  getConstructLoginData,
  navigateToConstruct,
  openAddonManager,
  pipelabAddonVisible,
  requestConstructLogin,
  waitForConstructProjectLoad,
  waitForConstructExportDownload,
} from "./script";
import { isConstructFreeEditionLimit } from "./listeners";

const exportRunPath = join(tmpdir(), "export-run");

describe("Construct edition detection", () => {
  it("recognizes the free edition limit prompt", () => {
    expect(
      isConstructFreeEditionLimit(
        "This project exceeds the free edition limits. Some features will be unavailable.",
      ),
    ).toBe(true);
    expect(isConstructFreeEditionLimit("The export options are ready.")).toBe(false);
  });
});

describe("Construct editor navigation", () => {
  it("returns at DOM content readiness and records the navigation duration", async () => {
    const url = "https://editor.construct.net/";
    const page = {
      goto: vi.fn().mockResolvedValue(null),
      url: vi.fn().mockReturnValue(url),
    } as unknown as Page;
    const log = vi.fn();

    await navigateToConstruct(page, url, log);

    expect(page.goto).toHaveBeenCalledWith(url, { waitUntil: "domcontentloaded" });
    expect(log).toHaveBeenCalledWith(
      "Construct document ready after",
      expect.stringMatching(/^\d+ ms$/),
    );
  });
});

describe("Construct account authentication", () => {
  it("uses a fresh API session instead of a stale cached login-data value", async () => {
    const freshLogin = { userID: 42, token: "fresh-token" };
    const login = await getConstructLoginData(
      { userID: 42, token: "stale-token" },
      Promise.resolve({ loginData: freshLogin, startedAt: Date.now() }),
      "user@example.com",
      "password",
      new AbortController().signal,
      vi.fn(),
    );

    expect(login).toEqual(freshLogin);
  });

  it("keeps an authenticated source profile on the cached-session path", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        getConstructLoginData(
          { userID: 42, token: "current-token" },
          undefined,
          "user@example.com",
          "password",
          new AbortController().signal,
          vi.fn(),
        ),
      ).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("aborts the Construct account request with its workflow signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("request signal missing"));
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          if (signal.aborted) reject(signal.reason);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const request = requestConstructLogin("user@example.com", "password", controller.signal);
      controller.abort(new Error("workflow cancelled"));

      await expect(request).rejects.toThrow("workflow cancelled");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://account.construct.net/login.json",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds the Construct account request when the endpoint does not respond", async () => {
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("request signal missing"));
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          if (signal.aborted) reject(signal.reason);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        requestConstructLogin("user@example.com", "password", new AbortController().signal, 5),
      ).rejects.toMatchObject({ name: "TimeoutError" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Construct project load readiness", () => {
  it("stops waiting for project load when the workflow is cancelled", async () => {
    let notifySecondWaitStarted = () => {};
    const secondWaitStarted = new Promise<void>((resolve) => {
      notifySecondWaitStarted = resolve;
    });
    const waitFor = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => {
        notifySecondWaitStarted();
        return new Promise<void>(() => {});
      });
    const progressBar = { getAttribute: vi.fn().mockResolvedValue(null) };
    const progressDialog = {
      waitFor,
      locator: vi.fn().mockReturnValue(progressBar),
    };
    const page = {
      locator: vi.fn().mockReturnValue(progressDialog),
    } as unknown as Page;
    const controller = new AbortController();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    try {
      const loading = waitForConstructProjectLoad(page, 120_000, controller.signal, vi.fn());
      await secondWaitStarted;
      controller.abort();

      await expect(loading).rejects.toMatchObject({ name: "AbortError" });
      expect(clearIntervalSpy).toHaveBeenCalledWith(expect.anything());
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });

  it("bounds both progress-dialog waits and clears polling after a timeout", async () => {
    const waitFor = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Construct project load timed out"));
    const progressBar = { getAttribute: vi.fn().mockResolvedValue(null) };
    const progressDialog = {
      waitFor,
      locator: vi.fn().mockReturnValue(progressBar),
    };
    const page = {
      locator: vi.fn().mockReturnValue(progressDialog),
    } as unknown as Page;
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    try {
      await expect(
        waitForConstructProjectLoad(page, 120_000, new AbortController().signal, vi.fn()),
      ).rejects.toThrow("Construct project load timed out");

      expect(waitFor).toHaveBeenNthCalledWith(1, { timeout: 120_000 });
      expect(waitFor).toHaveBeenNthCalledWith(2, { state: "detached", timeout: 120_000 });
      expect(clearIntervalSpy).toHaveBeenCalledWith(expect.anything());
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });
});

describe("Construct Addon Manager readiness", () => {
  it("waits for the editor and dismisses its startup tour before opening the menu", async () => {
    let editorReady = false;
    let tourDismissed = false;
    let openButtonChecks = 0;
    const openButton = {
      first: vi.fn(() => openButton),
      isVisible: vi.fn(async () => {
        openButtonChecks += 1;
        editorReady = openButtonChecks >= 2;
        return editorReady;
      }),
      isEnabled: vi.fn().mockResolvedValue(true),
    };
    const openText = {
      first: vi.fn(() => openText),
      isVisible: vi.fn().mockResolvedValue(false),
    };
    const menuButton = {
      click: vi.fn(async () => {
        editorReady = true;
        if (!tourDismissed) throw new Error("welcome tour dialog intercepted the menu");
      }),
    };
    const welcomeDialog = {
      isVisible: vi.fn(async () => editorReady && !tourDismissed),
      locator: vi.fn(() => ({
        click: vi.fn(async () => {
          tourDismissed = true;
        }),
      })),
      waitFor: vi.fn().mockResolvedValue(undefined),
    };
    const addonManagerDialog = { waitFor: vi.fn().mockResolvedValue(undefined) };
    const page = {
      locator: vi.fn((selector: string) => {
        if (selector === "body") {
          return { innerText: vi.fn(async () => (editorReady ? "Open" : "Loading")) };
        }
        if (selector === "#welcomeTourDialog") return welcomeDialog;
        if (selector === "#confirmDialog") {
          return { isVisible: vi.fn().mockResolvedValue(false) };
        }
        return addonManagerDialog;
      }),
      getByRole: vi.fn((role: string, options?: { name?: unknown }) => {
        if (role === "button" && options?.name instanceof RegExp) return openButton;
        if (role === "button" && options?.name === "Menu") return menuButton;
        return { click: vi.fn().mockResolvedValue(undefined) };
      }),
      getByText: vi.fn(() => openText),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await openAddonManager(page, new AbortController().signal, vi.fn());

    expect(openButtonChecks).toBeGreaterThanOrEqual(2);
    expect(editorReady).toBe(true);
    expect(tourDismissed).toBe(true);
    expect(menuButton.click).toHaveBeenCalledOnce();
  });

  it("recognizes the pinned addon version when Construct labels it with the SDK version", async () => {
    const makeDialog = (version: string) => {
      const row = {
        locator: vi.fn((selector: string) => ({
          innerText: vi
            .fn()
            .mockResolvedValue(selector.includes('columnname="name"') ? "Pipelab" : version),
        })),
      };
      const rows = {
        count: vi.fn().mockResolvedValue(1),
        nth: vi.fn(() => row),
      };
      return { locator: vi.fn(() => rows) } as unknown as Locator;
    };

    await expect(pipelabAddonVisible(makeDialog("2.5.1 (SDK v2)"))).resolves.toBe(true);
    await expect(pipelabAddonVisible(makeDialog("2.5.10 (SDK v2)"))).resolves.toBe(false);
  });
});

describe("Construct export download readiness", () => {
  it("waits for the configured export timeout", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const page = {
      locator: vi.fn((selector: string) =>
        selector === ".downloadExportedProject"
          ? { waitFor, isEnabled: vi.fn().mockResolvedValue(true) }
          : { innerText: vi.fn() },
      ),
      isClosed: vi.fn().mockReturnValue(false),
      screenshot: vi.fn(),
    } as unknown as Page;

    await waitForConstructExportDownload(page, 120_000, exportRunPath);

    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 120_000 });
  });

  it("includes Construct's current screen when the export download never appears", async () => {
    const waitFor = vi.fn().mockRejectedValue(new Error("Timeout 120000ms exceeded"));
    const pageText = "Preparing project data...";
    const screenshot = vi.fn().mockResolvedValue(undefined);
    const page = {
      locator: vi.fn((selector: string) =>
        selector === ".downloadExportedProject"
          ? { waitFor }
          : { innerText: vi.fn().mockResolvedValue(pageText) },
      ),
      isClosed: vi.fn().mockReturnValue(false),
      screenshot,
    } as unknown as Page;

    await expect(waitForConstructExportDownload(page, 120_000, exportRunPath)).rejects.toThrow(
      /Construct did not make its project download available within 120 seconds.*Preparing project data/,
    );
    expect(screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("construct-export-failure-") }),
    );
  });

  it("preserves cancellation when closing the browser interrupts the wait", async () => {
    const waitFor = vi.fn().mockRejectedValue(new Error("Target closed"));
    const screenshot = vi.fn();
    const page = {
      locator: vi.fn(() => ({ waitFor })),
      isClosed: vi.fn().mockReturnValue(true),
      screenshot,
    } as unknown as Page;
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      waitForConstructExportDownload(page, 120_000, exportRunPath, abortController.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(screenshot).not.toHaveBeenCalled();
  });

  it("handles the pending download rejection when clicking the control fails", async () => {
    const page = {
      waitForEvent: vi.fn().mockRejectedValue(new Error("download event failed")),
    } as unknown as Page;
    const button = {
      click: vi.fn().mockRejectedValue(new Error("Construct download button failed")),
    } as unknown as Locator;

    await expect(clickConstructDownload(page, button, 120_000)).rejects.toThrow(
      "Construct download button failed",
    );
    expect(page.waitForEvent).toHaveBeenCalledWith("download", { timeout: 120_000 });
  });
});
