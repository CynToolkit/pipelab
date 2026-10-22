import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import {
  clickConstructDownload,
  disableConstructUiAnimations,
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

describe("Construct UI animation setting", () => {
  const settingsPage = (
    welcomeInitiallyVisible: boolean,
    animationsInitiallyChecked: boolean,
    welcomeAppearsWhenMenuOpens = false,
    welcomeAppearsWhenSettingsOpens = false,
  ) => {
    let welcomeVisible = welcomeInitiallyVisible;
    let animationsChecked = animationsInitiallyChecked;
    let menuOpen = false;
    const actions: string[] = [];
    const welcomeDismiss = {
      click: vi.fn(async () => {
        welcomeVisible = false;
        actions.push("dismiss welcome tour");
      }),
    };
    const welcomeDialog = {
      waitFor: vi.fn(async ({ state }: { state?: string }) => {
        if (state === "visible" && !welcomeVisible) {
          throw Object.assign(new Error("welcome tour did not appear"), { name: "TimeoutError" });
        }
        if (state === "hidden" && welcomeVisible) {
          throw new Error("welcome tour is still visible");
        }
      }),
      isVisible: vi.fn(async () => welcomeVisible),
      locator: vi.fn(() => welcomeDismiss),
    };
    const menu = {
      click: vi.fn(async () => {
        actions.push("open menu");
        menuOpen = true;
        if (
          welcomeAppearsWhenMenuOpens &&
          actions.filter((action) => action === "open menu").length === 1
        ) {
          welcomeVisible = true;
          throw new Error("welcome tour intercepted the Menu click");
        }
      }),
    };
    const settings = {
      isVisible: vi.fn(async () => menuOpen && !welcomeVisible),
      click: vi.fn(async () => {
        actions.push("open settings");
        if (
          welcomeAppearsWhenSettingsOpens &&
          actions.filter((action) => action === "open settings").length === 1
        ) {
          welcomeVisible = true;
          throw new Error("welcome tour intercepted the Settings click");
        }
        menuOpen = false;
      }),
    };
    const animationSetting = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      isChecked: vi.fn(async () => animationsChecked),
      setChecked: vi.fn(async (checked: boolean) => {
        animationsChecked = checked;
      }),
    };
    const close = { click: vi.fn().mockResolvedValue(undefined) };
    const page = {
      locator: vi.fn((selector: string) => {
        if (selector === "#welcomeTourDialog") return welcomeDialog;
        throw new Error(`Unexpected Construct locator: ${selector}`);
      }),
      getByRole: vi.fn((role: string, options?: { name?: string; exact?: boolean }) => {
        if (role === "button" && options?.name === "Menu") return menu;
        if (role === "menuitem" && options?.name === "Settings") return settings;
        if (role === "checkbox" && options?.name === "Enable UI animations") return animationSetting;
        if (role === "button" && options?.name === "Close" && options.exact) {
          return { last: () => close };
        }
        throw new Error(`Unexpected Construct setting locator: ${role} ${options?.name ?? ""}`);
      }),
    } as unknown as Page;

    return { page, actions, menu, settings, animationSetting, welcomeDismiss, close };
  };

  it("dismisses the welcome tour before opening Settings and disables animations", async () => {
    const { page, actions, animationSetting, welcomeDismiss, close } = settingsPage(true, true);

    await disableConstructUiAnimations(page, new AbortController().signal, vi.fn());

    expect(welcomeDismiss.click).toHaveBeenCalledOnce();
    expect(actions.indexOf("dismiss welcome tour")).toBeLessThan(actions.indexOf("open menu"));
    expect(animationSetting.setChecked).toHaveBeenCalledWith(false, { timeout: 5_000 });
    expect(animationSetting.isChecked).toHaveBeenCalledTimes(2);
    expect(close.click).toHaveBeenCalledOnce();
  });

  it("does not toggle an already disabled setting when no welcome tour appears", async () => {
    const { page, animationSetting, welcomeDismiss, close } = settingsPage(false, false);

    await disableConstructUiAnimations(page, new AbortController().signal, vi.fn());

    expect(welcomeDismiss.click).not.toHaveBeenCalled();
    expect(animationSetting.setChecked).not.toHaveBeenCalled();
    expect(animationSetting.isChecked).toHaveBeenCalledTimes(2);
    expect(close.click).toHaveBeenCalledOnce();
  });

  it("dismisses a welcome tour that appears while the Menu is opening", async () => {
    const { page, actions, menu, welcomeDismiss } = settingsPage(false, false, true);

    await disableConstructUiAnimations(page, new AbortController().signal, vi.fn());

    expect(menu.click).toHaveBeenCalledOnce();
    expect(welcomeDismiss.click).toHaveBeenCalledOnce();
    expect(actions).toEqual(["open menu", "dismiss welcome tour", "open settings"]);
  });

  it("recovers when the welcome tour intercepts the Settings menu item", async () => {
    const { page, actions, settings, welcomeDismiss } = settingsPage(false, false, false, true);

    await disableConstructUiAnimations(page, new AbortController().signal, vi.fn());

    expect(settings.click).toHaveBeenCalledTimes(2);
    expect(welcomeDismiss.click).toHaveBeenCalledOnce();
    expect(actions).toEqual([
      "open menu",
      "open settings",
      "dismiss welcome tour",
      "open settings",
    ]);
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
