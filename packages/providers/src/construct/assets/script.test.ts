import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import {
  clickConstructDownload,
  constructAccountOrigin,
  getConstructLoginData,
  navigateToConstruct,
  prepareConstructEditor,
  requestConstructLogin,
  waitForConstructProjectLoad,
  waitForConstructExportDownload,
} from "./script";
import { isConstructFreeEditionLimit } from "./listeners";

const exportRunPath = join(tmpdir(), "export-run");

class AccountOriginPage {
  events: string[] = [];
  currentUrl = "about:blank";
  stores = new Map<string, Map<string, unknown>>();
  responsePredicate: ((response: { url: () => string }) => boolean) | undefined;
  resolveResponse: ((response: { url: () => string; ok: () => boolean }) => void) | undefined;
  reload = vi.fn();
  tokenResponseOk = true;

  async goto(url: string) {
    this.currentUrl = url;
    this.events.push(`goto:${new URL(url).origin}`);
    if (new URL(url).origin === "https://editor.construct.net") {
      const response = {
        url: () => `${constructAccountOrigin("r466-2")}/token.json`,
        ok: () => this.tokenResponseOk,
      };
      if (this.responsePredicate?.(response)) this.resolveResponse?.(response);
    }
  }

  url() {
    return this.currentUrl;
  }

  async waitForFunction() {
    this.events.push(`localforage:${new URL(this.currentUrl).origin}`);
  }

  async evaluate(callback: unknown, value?: unknown) {
    const origin = new URL(this.currentUrl).origin;
    const store = this.stores.get(origin) ?? new Map<string, unknown>();
    this.stores.set(origin, store);
    const source = String(callback);
    if (source.includes("getItem")) {
      this.events.push(`read:${origin}`);
      return store.get("login-data") ?? null;
    }
    this.events.push(`write:${origin}`);
    store.set("login-data", value);
    return value;
  }

  waitForResponse(predicate: (response: { url: () => string }) => boolean) {
    this.events.push("wait-for-token.json");
    this.responsePredicate = predicate;
    return new Promise<{ url: () => string; ok: () => boolean }>((resolve) => {
      this.resolveResponse = resolve;
    });
  }
}

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
  it.each([
    [undefined, "https://account.construct.net"],
    ["r466-2", "https://account.construct.net"],
    ["beta", "https://accountbeta.construct.net"],
    ["r466-beta", "https://accountbeta.construct.net"],
  ] as const)("selects account storage origin for Construct version %s", (version, origin) => {
    expect(constructAccountOrigin(version)).toBe(origin);
  });

  it("seeds the account origin before opening the editor and verifies its startup exchange", async () => {
    const page = new AccountOriginPage();
    const session = { userID: 42, token: "test-session" };

    await prepareConstructEditor(
      page as unknown as Page,
      "r466-2",
      "user@example.com",
      "test-password",
      Promise.resolve({ loginData: session, startedAt: Date.now() }),
      new AbortController().signal,
      vi.fn(),
    );

    expect(page.events).toEqual([
      "goto:https://account.construct.net",
      "localforage:https://account.construct.net",
      "read:https://account.construct.net",
      "write:https://account.construct.net",
      "wait-for-token.json",
      "goto:https://editor.construct.net",
    ]);
    expect(page.stores.get("https://account.construct.net")?.get("login-data")).toEqual(session);
    expect(page.stores.get("https://editor.construct.net")).toBeUndefined();
    expect(page.reload).not.toHaveBeenCalled();
  });

  it("uses the beta account origin for beta editor sessions", async () => {
    const page = new AccountOriginPage();
    const session = { userID: 42, token: "test-session" };
    const betaPage = page as unknown as Page;
    const editorGoto = page.goto.bind(page);
    page.goto = async (url: string) => {
      await editorGoto(url);
      if (new URL(url).origin === "https://editor.construct.net") {
        const response = {
          url: () => "https://accountbeta.construct.net/token.json",
          ok: () => true,
        };
        if (page.responsePredicate?.(response)) page.resolveResponse?.(response);
      }
    };

    await prepareConstructEditor(
      betaPage,
      "beta",
      "user@example.com",
      "test-password",
      Promise.resolve({ loginData: session, startedAt: Date.now() }),
      new AbortController().signal,
      vi.fn(),
    );

    expect(page.events[0]).toBe("goto:https://accountbeta.construct.net");
    expect(page.events.at(-1)).toBe("goto:https://editor.construct.net");
    expect(page.stores.get("https://accountbeta.construct.net")?.get("login-data")).toEqual(session);
    expect(page.stores.get("https://account.construct.net")).toBeUndefined();
  });

  it("leaves profile-only startup on the editor origin", async () => {
    const page = new AccountOriginPage();

    await prepareConstructEditor(
      page as unknown as Page,
      undefined,
      undefined,
      undefined,
      undefined,
      new AbortController().signal,
      vi.fn(),
    );

    expect(page.events).toEqual(["goto:https://editor.construct.net"]);
  });

  it("fails closed when Construct rejects the startup session exchange", async () => {
    const page = new AccountOriginPage();
    page.tokenResponseOk = false;

    await expect(
      prepareConstructEditor(
        page as unknown as Page,
        "r466-2",
        "user@example.com",
        "test-password",
        Promise.resolve({
          loginData: { userID: 42, token: "test-session" },
          startedAt: Date.now(),
        }),
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("Construct did not confirm the prepared account session");
  });

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
