import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import {
  clickConstructDownload,
  getConstructLoginData,
  navigateToConstruct,
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

describe("Construct editor settings preseed", () => {
  it("installs the storage seed before navigation and waits for it to finish", async () => {
    const actions: string[] = [];
    const url = "https://editor.construct.net/r397/";
    const addInitScript = vi.fn(async () => {
      actions.push("install seed");
    });
    const goto = vi.fn(async () => {
      actions.push("navigate");
    });
    const evaluate = vi.fn(async () => {
      actions.push("confirm seed");
      return { welcomeTourDismissed: true, uiAnimationsDisabled: true };
    });
    const page = {
      addInitScript,
      goto,
      evaluate,
      url: vi.fn().mockReturnValue(url),
    } as unknown as Page;
    const log = vi.fn();

    await navigateToConstruct(page, url, log, new AbortController().signal);

    expect(actions).toEqual(["install seed", "navigate", "confirm seed"]);
    expect(addInitScript).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith(url, { waitUntil: "domcontentloaded" });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("Construct startup settings seeded before editor load");
  });

  it("stops navigation setup when the storage seed fails", async () => {
    const url = "https://editor.construct.net/r397/";
    const addInitScript = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(null);
    const evaluate = vi.fn().mockRejectedValue(new Error("IndexedDB seed failed"));
    const page = {
      addInitScript,
      goto,
      evaluate,
      url: vi.fn().mockReturnValue(url),
    } as unknown as Page;

    await expect(
      navigateToConstruct(page, url, vi.fn(), new AbortController().signal),
    ).rejects.toThrow("IndexedDB seed failed");
    expect(addInitScript).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledOnce();
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
