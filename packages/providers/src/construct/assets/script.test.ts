import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import {
  clickConstructDownload,
  constructAccountOrigin,
  getConstructLoginData,
  navigateToConstruct,
  openConstructProjectFile,
  prepareConstructEditor,
  requestConstructLogin,
  script,
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
  resolveResponse:
    | ((response: { url: () => string; ok: () => boolean; json: () => Promise<unknown> }) => void)
    | undefined;
  reload = vi.fn();
  tokenResponseOk = true;
  tokenResponseOkOnEditorNavigation: boolean[] = [];
  tokenResponsePayload: unknown = { request: { status: "ok" } };
  tokenResponseJson: () => Promise<unknown> = async () => this.tokenResponsePayload;
  visitedUrls: string[] = [];
  waitForFunctionArgs: unknown[] = [];

  async addInitScript() {
    this.events.push("install-editor-preferences");
  }

  async goto(url: string) {
    this.currentUrl = url;
    this.visitedUrls.push(url);
    this.events.push(`goto:${new URL(url).origin}`);
    if (new URL(url).origin === "https://editor.construct.net") {
      const response = {
        url: () => `${constructAccountOrigin("r466-2")}/token.json`,
        ok: () => this.tokenResponseOkOnEditorNavigation.shift() ?? this.tokenResponseOk,
        json: this.tokenResponseJson,
      };
      if (this.responsePredicate?.(response)) this.resolveResponse?.(response);
    }
  }

  url() {
    return this.currentUrl;
  }

  async waitForFunction(...args: unknown[]) {
    this.waitForFunctionArgs = args;
    this.events.push(`localforage:${new URL(this.currentUrl).origin}`);
  }

  async evaluate(callback: unknown, value?: unknown) {
    const origin = new URL(this.currentUrl).origin;
    const store = this.stores.get(origin) ?? new Map<string, unknown>();
    this.stores.set(origin, store);
    const source = String(callback);
    if (source.includes("__pipelabConstructPreferencesReady")) {
      this.events.push("confirm-editor-preferences");
      return {
        welcomeTourDismissed: true,
        uiAnimationsDisabled: true,
        uiEffectsDisabled: true,
        addonUpdateChecksDisabled: true,
        startPageHidden: true,
      };
    }
    if (source.includes("getItem")) {
      this.events.push(`read:${origin}`);
      return store.get("login-data") ?? null;
    }
    this.events.push(`write:${origin}`);
    store.set("login-data", value);
    return value;
  }

  waitForResponse(
    predicate: (response: { url: () => string }) => boolean,
    _options?: { timeout: number },
  ) {
    this.events.push("wait-for-token.json");
    this.responsePredicate = predicate;
    return new Promise<{
      url: () => string;
      ok: () => boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      this.resolveResponse = resolve;
    });
  }
}

class EditionLimitPage extends AccountOriginPage {
  keyboard = { press: vi.fn(async () => undefined) };

  isClosed() {
    return false;
  }

  locator(selector: string) {
    return this.createLocator(selector);
  }

  getByRole(role: string, options: { name?: string | RegExp }) {
    const name = options.name;
    const visible =
      role === "button" && (name === "Menu" || (name instanceof RegExp && name.test("Open")));
    return this.createLocator(`${role}:${String(name)}`, visible);
  }

  getByText(text: string) {
    return this.createLocator(`text:${text}`);
  }

  waitForEvent(event: string) {
    if (event === "filechooser") return Promise.resolve({ setFiles: vi.fn(async () => undefined) });
    return Promise.reject(new Error(`Unexpected browser event: ${event}`));
  }

  private createLocator(selector: string, visible = false) {
    const locator = {
      first: () => locator,
      filter: () => locator,
      locator: (child: string) => this.createLocator(`${selector} ${child}`),
      waitFor: async (options?: { timeout?: number }) => {
        if (options?.timeout === 0) throw new Error("not visible");
      },
      isVisible: async () => selector === "#okDialog" || visible,
      isEnabled: async () => true,
      innerText: async () =>
        selector === "#okDialog"
          ? "This project exceeds the free edition limits. Some features will be unavailable."
          : "",
      getAttribute: async () => null,
      click: async () => undefined,
      allInnerTexts: async () => [],
    };
    return locator;
  }
}

describe("Construct edition detection", () => {
  it("recognizes plan limits separately from account authentication failures", async () => {
    const password = "construct-auth-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ request: { status: "error" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const loginFailure = await requestConstructLogin(
        "construct-user@example.test",
        password,
        new AbortController().signal,
      ).catch((error: unknown) => error);

      expect(loginFailure).toEqual(new Error("Construct account authentication failed"));
      expect(String(loginFailure)).not.toContain(password);
      expect(isConstructFreeEditionLimit(String(loginFailure))).toBe(false);
      expect(
        isConstructFreeEditionLimit(
          "This project exceeds the free edition limits. Some features will be unavailable.",
        ),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(isConstructFreeEditionLimit("The export options are ready.")).toBe(false);
  });

  it("reports the plan restriction after successful account authentication and project load", async () => {
    const page = new EditionLimitPage();
    const token = "authenticated-session-token";
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ request: { status: "ok" }, response: { userID: 42, token } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        script(
          page as unknown as Page,
          vi.fn(),
          "/project.c3p",
          "construct-user@example.test",
          "construct-password-secret",
          "r466-2",
          exportRunPath,
          new AbortController().signal,
          1_000,
        ),
      ).rejects.toThrow(
        "Construct reports that this project exceeds the free edition limits. Verify that the selected account has a plan that covers this project.",
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(page.stores.get("https://account.construct.net")?.get("login-data")).toEqual({
        userID: 42,
        token,
      });
    } finally {
      vi.unstubAllGlobals();
    }
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
      return {
        welcomeTourDismissed: true,
        uiAnimationsDisabled: true,
        uiEffectsDisabled: true,
        addonUpdateChecksDisabled: true,
        startPageHidden: true,
      };
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

  it("cancels while waiting for the editor settings seed", async () => {
    const url = "https://editor.construct.net/r397/";
    const controller = new AbortController();
    const addInitScript = vi.fn(() => new Promise<void>(() => {}));
    const goto = vi.fn();
    const page = {
      addInitScript,
      goto,
      url: vi.fn().mockReturnValue(url),
    } as unknown as Page;

    const navigation = navigateToConstruct(page, url, vi.fn(), controller.signal);
    controller.abort();

    await expect(navigation).rejects.toMatchObject({ name: "AbortError" });
    expect(addInitScript).toHaveBeenCalledOnce();
    expect(goto).not.toHaveBeenCalled();
  });

  it("observes a rejected page operation when cancellation races its start", async () => {
    const url = "https://editor.construct.net/r397/";
    const controller = new AbortController();
    const rejectedOperation = Promise.reject(new Error("browser context closed"));
    const observeRejection = vi.spyOn(rejectedOperation, "catch");
    const page = {
      addInitScript: vi.fn(() => {
        controller.abort();
        return rejectedOperation;
      }),
      goto: vi.fn(),
      url: vi.fn().mockReturnValue(url),
    } as unknown as Page;
    const unhandledRejections: unknown[] = [];
    const captureUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", captureUnhandledRejection);

    try {
      await expect(
        navigateToConstruct(page, url, vi.fn(), controller.signal),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(observeRejection).toHaveBeenCalledOnce();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", captureUnhandledRejection);
    }
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
      "install-editor-preferences",
      "goto:https://editor.construct.net",
      "confirm-editor-preferences",
    ]);
    expect(page.visitedUrls).toContain(
      "https://account.construct.net/login?theme=default&lang=en-US&productType=games",
    );
    expect(page.waitForFunctionArgs).toEqual([
      expect.any(Function),
      undefined,
      { timeout: 30_000 },
    ]);
    expect(page.stores.get("https://account.construct.net")?.get("login-data")).toEqual(session);
    expect(page.stores.get("https://editor.construct.net")?.get("login-data")).toBeUndefined();
    expect(page.reload).not.toHaveBeenCalled();
  });

  it("reuses a cached account session when the managed Connection identity is trusted", async () => {
    const page = new AccountOriginPage();
    const cachedSession = { userID: 42, token: "cached-session" };
    const apiLogin = vi.fn(async () => ({
      loginData: { userID: 42, token: "fresh-session" },
      startedAt: Date.now(),
    }));
    page.stores.set("https://account.construct.net", new Map([["login-data", cachedSession]]));

    await prepareConstructEditor(
      page as unknown as Page,
      "r466-2",
      "user@example.com",
      "test-password",
      apiLogin,
      new AbortController().signal,
      vi.fn(),
      true,
    );

    expect(page.stores.get("https://account.construct.net")?.get("login-data")).toEqual(
      cachedSession,
    );
    expect(page.events).not.toContain("write:https://account.construct.net");
    expect(apiLogin).not.toHaveBeenCalled();
  });

  it("replaces an untrusted cached profile session with the bound Connection account", async () => {
    const page = new AccountOriginPage();
    const cachedSession = { userID: 7, token: "another-account-session" };
    const boundAccountSession = { userID: 42, token: "bound-account-session" };
    const apiLogin = vi.fn(async () => ({
      loginData: boundAccountSession,
      startedAt: Date.now(),
    }));
    page.stores.set("https://account.construct.net", new Map([["login-data", cachedSession]]));

    await prepareConstructEditor(
      page as unknown as Page,
      "r466-2",
      "bound-user@example.com",
      "bound-password",
      apiLogin,
      new AbortController().signal,
      vi.fn(),
      false,
    );

    expect(apiLogin).toHaveBeenCalledOnce();
    expect(page.stores.get("https://account.construct.net")?.get("login-data")).toEqual(
      boundAccountSession,
    );
  });

  it("refreshes a cached session with Connection credentials when Construct rejects it", async () => {
    const page = new AccountOriginPage();
    const freshSession = { userID: 42, token: "fresh-session" };
    page.stores.set(
      "https://account.construct.net",
      new Map([["login-data", { userID: 42, token: "stale-session" }]]),
    );
    page.tokenResponseOkOnEditorNavigation = [false, true];
    const apiLogin = vi.fn(async () => ({ loginData: freshSession, startedAt: Date.now() }));

    await prepareConstructEditor(
      page as unknown as Page,
      "r466-2",
      "user@example.com",
      "test-password",
      apiLogin,
      new AbortController().signal,
      vi.fn(),
      true,
    );

    expect(apiLogin).toHaveBeenCalledOnce();
    expect(page.stores.get("https://account.construct.net")?.get("login-data")).toEqual(
      freshSession,
    );
    expect(
      page.visitedUrls.filter((url) => new URL(url).origin === "https://editor.construct.net"),
    ).toHaveLength(2);
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
          json: async () => ({ request: { status: "ok" } }),
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
    expect(page.events).toContain("goto:https://editor.construct.net");
    expect(page.events).toContain("confirm-editor-preferences");
    expect(page.stores.get("https://accountbeta.construct.net")?.get("login-data")).toEqual(
      session,
    );
    expect(page.stores.get("https://account.construct.net")).toBeUndefined();
  });

  it("confirms the selected profile session without changing account storage", async () => {
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

    expect(page.events).toEqual([
      "wait-for-token.json",
      "install-editor-preferences",
      "goto:https://editor.construct.net",
      "confirm-editor-preferences",
    ]);
    expect(page.stores.has("https://account.construct.net")).toBe(false);
  });

  it("fails closed when a profile-only session is rejected", async () => {
    const page = new AccountOriginPage();
    page.tokenResponsePayload = { request: { status: "error" } };

    await expect(
      prepareConstructEditor(
        page as unknown as Page,
        undefined,
        undefined,
        undefined,
        undefined,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("Construct did not confirm the prepared account session");
  });

  it("fails closed when profile-only startup has no token confirmation", async () => {
    const page = new AccountOriginPage();
    page.waitForResponse = vi.fn().mockRejectedValue(new Error("response timed out"));

    await expect(
      prepareConstructEditor(
        page as unknown as Page,
        undefined,
        undefined,
        undefined,
        undefined,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("Construct did not confirm the prepared account session");
  });

  it("cancels profile-only startup while waiting for token confirmation", async () => {
    const page = new AccountOriginPage();
    const controller = new AbortController();
    const preparation = prepareConstructEditor(
      page as unknown as Page,
      undefined,
      undefined,
      undefined,
      undefined,
      controller.signal,
      vi.fn(),
    );
    controller.abort();

    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels while waiting for account storage readiness", async () => {
    const controller = new AbortController();
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue("https://account.construct.net/"),
      waitForFunction: vi.fn(() => new Promise<void>(() => {})),
      evaluate: vi.fn(),
    } as unknown as Page;

    const preparation = prepareConstructEditor(
      page,
      "r466-2",
      "user@example.com",
      "test-password",
      Promise.resolve({ loginData: { userID: 42, token: "test-session" }, startedAt: Date.now() }),
      controller.signal,
      vi.fn(),
    );
    controller.abort();

    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledOnce();
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

  it("fails closed when the token endpoint returns an unsuccessful confirmation envelope", async () => {
    const page = new AccountOriginPage();
    page.tokenResponsePayload = { request: { status: "error" } };

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

  it("handles token confirmation failure while editor navigation is still pending", async () => {
    const page = new AccountOriginPage();
    page.tokenResponsePayload = { request: { status: "error" } };
    let releaseEditorNavigation: (() => void) | undefined;
    let editorNavigationStarted: (() => void) | undefined;
    const editorNavigationStartedPromise = new Promise<void>((resolve) => {
      editorNavigationStarted = resolve;
    });
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string) => {
      const navigation = originalGoto(url);
      if (new URL(url).origin === "https://editor.construct.net") {
        editorNavigationStarted?.();
        await new Promise<void>((resolve) => {
          releaseEditorNavigation = resolve;
        });
      }
      await navigation;
    };

    const preparation = prepareConstructEditor(
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
    );
    await editorNavigationStartedPromise;
    const settledBeforeNavigation = await Promise.race([
      preparation.then(
        () => "resolved" as const,
        () => "rejected" as const,
      ),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 50)),
    ]);
    releaseEditorNavigation?.();

    await expect(preparation).rejects.toThrow(
      "Construct did not confirm the prepared account session",
    );
    expect(settledBeforeNavigation).toBe("rejected");
  });

  it("aborts when the token confirmation response body stalls", async () => {
    const page = new AccountOriginPage();
    let bodyReadStarted: (() => void) | undefined;
    const bodyReadStartedPromise = new Promise<void>((resolve) => {
      bodyReadStarted = resolve;
    });
    page.tokenResponseJson = () => {
      bodyReadStarted?.();
      return new Promise<unknown>(() => {});
    };
    const controller = new AbortController();

    const preparation = prepareConstructEditor(
      page as unknown as Page,
      "r466-2",
      "user@example.com",
      "test-password",
      Promise.resolve({
        loginData: { userID: 42, token: "test-session" },
        startedAt: Date.now(),
      }),
      controller.signal,
      vi.fn(),
    );
    await bodyReadStartedPromise;
    controller.abort();

    await expect(preparation).rejects.toMatchObject({ name: "AbortError" });
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
  it("opens a project as soon as the hidden-Start-Page editor shell is ready", async () => {
    const fileChooser = { setFiles: vi.fn().mockResolvedValue(undefined) };
    let resolveFileChooser: ((value: typeof fileChooser) => void) | undefined;
    const unavailableOpenControl = {
      first: () => unavailableOpenControl,
      isEnabled: vi.fn().mockResolvedValue(false),
      isVisible: vi.fn().mockResolvedValue(false),
    };
    const menuButton = {
      first: () => menuButton,
      isVisible: vi.fn().mockResolvedValue(true),
    };
    const loadingOverlay = {
      isVisible: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    };
    const page = {
      getByRole: vi.fn((_role: string, options: { name: string | RegExp }) =>
        options.name === "Menu" ? menuButton : unavailableOpenControl,
      ),
      getByText: vi.fn().mockReturnValue(unavailableOpenControl),
      isClosed: vi.fn().mockReturnValue(false),
      keyboard: {
        press: vi.fn(async () => resolveFileChooser?.(fileChooser)),
      },
      locator: vi.fn((selector: string) =>
        selector === "body" ? { innerText: vi.fn().mockResolvedValue("Menu") } : loadingOverlay,
      ),
      waitForEvent: vi.fn(
        () =>
          new Promise<typeof fileChooser>((resolve) => {
            resolveFileChooser = resolve;
          }),
      ),
    } as unknown as Page;
    const log = vi.fn();

    await openConstructProjectFile(
      page,
      "/tmp/project.c3p",
      new AbortController().signal,
      log,
      "/tmp",
    );

    expect(log).toHaveBeenCalledWith(
      "Construct editor ready after",
      expect.stringMatching(/^\d+ ms$/),
    );
    expect(loadingOverlay.isVisible).toHaveBeenCalledTimes(2);
    expect(page.keyboard.press).toHaveBeenCalledWith("ControlOrMeta+O");
    expect(fileChooser.setFiles).toHaveBeenCalledWith(["/tmp/project.c3p"]);
  });

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
