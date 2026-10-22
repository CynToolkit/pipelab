import type { Locator, Page, Response } from "playwright";
import { join } from "node:path";
import {
  registerInstallButtonListener,
  registerWebglErrorListener,
  registerDeprecatedFeatures,
  registerConfirmDialogListener,
  registerNotNowListener,
  isConstructFreeEditionLimit,
} from "./listeners.js";

const CONSTRUCT_READY_TIMEOUT_MS = 15_000;
const CONSTRUCT_SETTINGS_SEED_TIMEOUT_MS = 15_000;
const FILE_CHOOSER_TIMEOUT_MS = 5_000;
const CONSTRUCT_API_TIMEOUT_MS = 30_000;
const CONSTRUCT_TOKEN_TIMEOUT_MS = 30_000;
const OPEN_RETRY_COUNT = 1;
const CONSTRUCT_EDITOR_ORIGIN = "https://editor.construct.net";

const logElapsed = (log: typeof console.log, label: string, startedAt: number) => {
  log(label, `${Date.now() - startedAt} ms`);
};

type ConstructLoginData = { userID: string | number; token: string };
type ConstructLoginResult =
  | { loginData: ConstructLoginData; startedAt: number }
  | { error: unknown; startedAt: number };

export const constructAccountOrigin = (version: string | undefined) => {
  const normalizedVersion = version?.trim().toLowerCase() ?? "";
  const isBeta = normalizedVersion === "beta" || /^r\d+-beta(?:[-.]?\d+)?$/.test(normalizedVersion);
  return isBeta ? "https://accountbeta.construct.net" : "https://account.construct.net";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const requestConstructLogin = async (
  username: string,
  password: string,
  abortSignal: AbortSignal,
  timeoutMs = CONSTRUCT_API_TIMEOUT_MS,
  accountOrigin = constructAccountOrigin(undefined),
): Promise<ConstructLoginData> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Construct account request timeout must be a positive number");
  }

  throwIfAborted(abortSignal);
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);
  formData.append("productType", "games");

  const response = await fetch(`${accountOrigin}/login.json`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.any([abortSignal, AbortSignal.timeout(timeoutMs)]),
  });
  if (!response.ok) throw new Error("Construct account authentication failed");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Construct account API returned an invalid response");
  }
  const request = isRecord(payload) && isRecord(payload.request) ? payload.request : undefined;
  if (!request || request.status !== "ok") {
    throw new Error("Construct account authentication failed");
  }

  const login = isRecord(payload) && isRecord(payload.response) ? payload.response : undefined;
  const userID = login?.userID;
  const token = login?.token;
  if (
    (typeof userID !== "string" && typeof userID !== "number") ||
    typeof token !== "string" ||
    token.length === 0
  ) {
    throw new Error("Construct account API returned an invalid login response");
  }
  return { userID, token };
};

const isConstructLoginData = (value: unknown): value is ConstructLoginData =>
  isRecord(value) &&
  (typeof value.userID === "string" || typeof value.userID === "number") &&
  typeof value.token === "string" &&
  value.token.length > 0;

export const getConstructLoginData = async (
  authState: unknown,
  apiLogin: Promise<ConstructLoginResult> | undefined,
  username: string,
  password: string,
  abortSignal: AbortSignal,
  log: typeof console.log,
  accountOrigin = constructAccountOrigin(undefined),
): Promise<ConstructLoginData | undefined> => {
  throwIfAborted(abortSignal);

  if (apiLogin) {
    const result = await apiLogin;
    throwIfAborted(abortSignal);
    logElapsed(log, "Construct API authentication after", result.startedAt);
    if ("error" in result) {
      if (result.error instanceof Error && result.error.name === "TimeoutError") {
        throw new Error("Construct account authentication timed out");
      }
      throw new Error("Construct account authentication failed");
    }
    return result.loginData;
  }

  if (isConstructLoginData(authState)) {
    log("Already authenticated via copied profile, skipping login");
    return undefined;
  }

  const fallbackApiStartedAt = Date.now();
  const loginData = await requestConstructLogin(
    username,
    password,
    abortSignal,
    CONSTRUCT_API_TIMEOUT_MS,
    accountOrigin,
  );
  logElapsed(log, "Construct API authentication after", fallbackApiStartedAt);
  return loginData;
};

const constructExportStatus = async (page: Page) => {
  const pageText = await page
    .locator("body")
    .innerText({ timeout: 2_000 })
    .catch(() => "");
  return pageText
    .split(/\s*\n\s*/)
    .filter((line) => /prepar|export|download|error|failed|progress|offline|options/i.test(line))
    .slice(0, 4)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
};

export const waitForConstructExportDownload = async (
  page: Page,
  timeoutMs: number,
  diagnosticsDir: string,
  abortSignal?: AbortSignal,
): Promise<Locator> => {
  const downloadButton = page.locator(".downloadExportedProject");
  try {
    await downloadButton.waitFor({ state: "visible", timeout: timeoutMs });
  } catch (error) {
    if (abortSignal?.aborted) throw createAbortError(abortSignal);
    if (isAbortError(error) || isRendererCrash(error) || page.isClosed()) throw error;
    const status = await constructExportStatus(page);
    const screenshotPath = join(diagnosticsDir, `construct-export-failure-${Date.now()}.png`);
    let screenshotDetails = "";
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5_000 });
      screenshotDetails = ` Screenshot: ${screenshotPath}`;
    } catch {
      // Keep the Construct failure details if the page can no longer be captured.
    }
    const timeoutSeconds = Math.ceil(timeoutMs / 1_000);
    throw new Error(
      `Construct did not make its project download available within ${timeoutSeconds} seconds.${status ? ` Current status: ${status}.` : ""}${screenshotDetails}${error instanceof Error ? ` (${error.message})` : ""}`,
    );
  }
  if (!(await downloadButton.isEnabled()))
    throw new Error("Construct's project download is still disabled after preparing the export");
  return downloadButton;
};

export const clickConstructDownload = async (
  page: Page,
  downloadButton: Locator,
  timeoutMs: number,
) => {
  const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs }).then(
    (download) => ({ download }),
    (error: unknown) => ({ error }),
  );
  await downloadButton.click({ timeout: timeoutMs });
  const result = await downloadPromise;
  if ("error" in result) throw result.error;
  return result.download;
};

type ConstructSettingsSeedOptions = { origin: string; timeoutMs: number };
type ConstructSettingsSeedResult = {
  welcomeTourDismissed: true;
  uiAnimationsDisabled: true;
  uiEffectsDisabled: true;
  addonUpdateChecksDisabled: true;
  startPageHidden: true;
};

const seedConstructEditorSettings = (options: ConstructSettingsSeedOptions) => {
  if (window.top !== window || location.origin !== options.origin) return;

  const seed = new Promise<ConstructSettingsSeedResult>((resolve, reject) => {
    let database: IDBDatabase | undefined;
    let settled = false;
    let timeout: number;
    // Object methods keep this injected callback free of transpiler name helpers.
    const completion = {
      finish(result: ConstructSettingsSeedResult | Error) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        database?.close();
        if (result instanceof Error) reject(result);
        else resolve(result);
      },
      fail(error: unknown) {
        completion.finish(
          error instanceof Error
            ? error
            : new Error("Could not seed Construct editor preferences"),
        );
      },
    };
    timeout = window.setTimeout(
      () => completion.fail(new Error("Construct editor preference seed timed out")),
      options.timeoutMs,
    );

    const request = indexedDB.open("localforage");
    request.onerror = () => completion.fail(request.error);
    request.onblocked = () => completion.fail(new Error("Construct preference storage is blocked"));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("keyvaluepairs")) {
        request.result.createObjectStore("keyvaluepairs");
      }
    };
    request.onsuccess = () => {
      database = request.result;
      if (settled) {
        database.close();
        return;
      }
      if (!database.objectStoreNames.contains("keyvaluepairs")) {
        completion.fail(new Error("Construct preference storage has an unexpected schema"));
        return;
      }

      let transaction: IDBTransaction;
      try {
        transaction = database.transaction("keyvaluepairs", "readwrite");
      } catch (error) {
        completion.fail(error);
        return;
      }
      const store = transaction.objectStore("keyvaluepairs");
      const settingsRequest = store.get("c3-user-settings");
      settingsRequest.onerror = () => {
        transaction.abort();
        completion.fail(settingsRequest.error);
      };
      settingsRequest.onsuccess = () => {
        try {
          const current = settingsRequest.result;
          const userSettings =
            typeof current === "object" && current !== null && !Array.isArray(current)
              ? current
              : {};
          userSettings.enableUIAnimations = false;
          userSettings.enableUIEffects = false;
          // Editors before r422 ignore the addon-update preference.
          userSettings.checkForAddonUpdates = false;
          userSettings.showStartPageOnStartup = false;
          store.put(userSettings, "c3-user-settings");
          store.put(true, "c3-done-first-run");
        } catch (error) {
          transaction.abort();
          completion.fail(error);
        }
      };
      transaction.oncomplete = () => {
        completion.finish({
          welcomeTourDismissed: true,
          uiAnimationsDisabled: true,
          uiEffectsDisabled: true,
          addonUpdateChecksDisabled: true,
          startPageHidden: true,
        });
      };
      transaction.onerror = () => completion.fail(transaction.error);
      transaction.onabort = () => completion.fail(transaction.error);
    };
  });
  void seed.catch(() => {});
  Object.defineProperty(window, "__pipelabConstructPreferencesReady", { value: seed });
};

export const navigateToConstruct = async (
  page: Page,
  url: string,
  log: typeof console.log,
  signal: AbortSignal,
) => {
  throwIfAborted(signal);
  const shouldSeedEditorSettings = new URL(url).origin === CONSTRUCT_EDITOR_ORIGIN;
  if (shouldSeedEditorSettings) {
    await awaitWithAbort(
      page.addInitScript(seedConstructEditorSettings, {
        origin: CONSTRUCT_EDITOR_ORIGIN,
        timeoutMs: CONSTRUCT_SETTINGS_SEED_TIMEOUT_MS,
      }),
      signal,
    );
  }

  log("Navigating to URL", url);
  const navigationStartedAt = Date.now();
  await awaitWithAbort(page.goto(url, { waitUntil: "domcontentloaded" }), signal);
  log("Construct document ready after", `${Date.now() - navigationStartedAt} ms`);
  log("after navigating, current URL:", page.url());

  if (!shouldSeedEditorSettings) return;

  const seededPreferences = await awaitWithAbort(
    page.evaluate(async () => {
      const state = window as Window & {
        __pipelabConstructPreferencesReady?: Promise<ConstructSettingsSeedResult>;
      };
      if (!state.__pipelabConstructPreferencesReady) {
        throw new Error("Construct editor preference seeding did not run for this origin");
      }
      return await state.__pipelabConstructPreferencesReady;
    }),
    signal,
  );
  throwIfAborted(signal);
  if (
    !seededPreferences.welcomeTourDismissed ||
    !seededPreferences.uiAnimationsDisabled ||
    !seededPreferences.uiEffectsDisabled ||
    !seededPreferences.addonUpdateChecksDisabled ||
    !seededPreferences.startPageHidden
  ) {
    throw new Error("Construct editor preferences were not seeded");
  }
  log("Construct startup settings seeded before editor load");
};

const isAbortError = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));

const isRendererCrash = (error: unknown) =>
  error instanceof Error && /(?:page|target) crashed/i.test(error.message);

const createAbortError = (signal: AbortSignal) => {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  const error = new Error(
    reason instanceof Error ? reason.message : "Construct project open was cancelled",
  );
  error.name = "AbortError";
  return error;
};

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw createAbortError(signal);
};

const awaitWithAbort = async <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) {
    void promise.catch(() => {});
    throw createAbortError(signal);
  }
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(createAbortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

const isConstructTokenResponse = (response: Response, accountOrigin: string) => {
  const responseUrl = new URL(response.url());
  return responseUrl.origin === accountOrigin && responseUrl.pathname === "/token.json";
};

const waitForConstructTokenResponse = async (
  page: Page,
  accountOrigin: string,
  abortSignal: AbortSignal,
) => {
  const responsePromise = page
    .waitForResponse((response) => isConstructTokenResponse(response, accountOrigin), {
      timeout: CONSTRUCT_TOKEN_TIMEOUT_MS,
    })
    .then(
      (response) => response,
      (): undefined => undefined,
    );
  const response = await awaitWithAbort(responsePromise, abortSignal);
  if (!response?.ok()) {
    throw new Error("Construct did not confirm the prepared account session");
  }

  let payload: unknown;
  try {
    payload = await awaitWithAbort(
      response.json(),
      AbortSignal.any([abortSignal, AbortSignal.timeout(CONSTRUCT_TOKEN_TIMEOUT_MS)]),
    );
  } catch {
    if (abortSignal.aborted) throw createAbortError(abortSignal);
    throw new Error("Construct did not confirm the prepared account session");
  }
  const request = isRecord(payload) && isRecord(payload.request) ? payload.request : undefined;
  if (request?.status !== "ok") {
    throw new Error("Construct did not confirm the prepared account session");
  }
};

/**
 * Seeds account-site storage before opening the editor. Construct keeps
 * `login-data` on account.construct.net (accountbeta.construct.net for beta),
 * and its editor startup iframe exchanges that session at `/token.json`.
 * See https://github.com/skymen/c3cli/blob/main/docs/how-it-works.md for the
 * published description of this account-origin handoff; no c3cli code is used.
 */
export const prepareConstructEditor = async (
  page: Page,
  version: string | undefined,
  username: string | undefined,
  password: string | undefined,
  apiLogin: Promise<ConstructLoginResult> | undefined,
  abortSignal: AbortSignal,
  log: typeof console.log,
) => {
  const editorUrl = `https://editor.construct.net/${version ?? ""}`;
  if (!username || !password) {
    await navigateToConstruct(page, editorUrl, log, abortSignal);
    return;
  }

  const accountOrigin = constructAccountOrigin(version);
  await navigateToConstruct(
    page,
    `${accountOrigin}/login?theme=default&lang=en-US&productType=games`,
    log,
    abortSignal,
  );
  if (new URL(page.url()).origin !== accountOrigin) {
    throw new Error("Construct account origin redirected unexpectedly");
  }
  await awaitWithAbort(
    page.waitForFunction(
      () => typeof localforage !== "undefined",
      undefined,
      { timeout: 30_000 },
    ),
    abortSignal,
  );
  const authState = await awaitWithAbort(
    page.evaluate(async () => {
      const data = await localforage.getItem("login-data");
      return data as unknown;
    }),
    abortSignal,
  );
  const loginData = await getConstructLoginData(
    authState,
    apiLogin,
    username,
    password,
    abortSignal,
    log,
    accountOrigin,
  );

  if (loginData) {
    log("Preparing Construct account session before editor startup");
    await awaitWithAbort(
      page.evaluate(async (data) => {
        await localforage.setItem("login-data", data);
      }, loginData),
      abortSignal,
    );
  }

  const tokenResponse = waitForConstructTokenResponse(page, accountOrigin, abortSignal);
  await Promise.all([navigateToConstruct(page, editorUrl, log, abortSignal), tokenResponse]);
};

const waitForLocatorWithAbort = async (
  locator: Locator,
  options: { state?: "attached" | "detached" | "visible" | "hidden"; timeout: number },
  signal: AbortSignal,
) => {
  throwIfAborted(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(createAbortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });

  try {
    await Promise.race([locator.waitFor(options), aborted]);
    throwIfAborted(signal);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

export const waitForConstructProjectLoad = async (
  page: Page,
  timeoutMs: number,
  abortSignal: AbortSignal,
  log: typeof console.log,
) => {
  const progressDialog = page.locator("#progressDialog");
  const progressBar = progressDialog.locator(".progressBar");

  log("Waiting for progress dialog");
  const projectLoadStartedAt = Date.now();
  await waitForLocatorWithAbort(progressDialog, { timeout: timeoutMs }, abortSignal);
  logElapsed(log, "Construct project loading dialog appeared after", projectLoadStartedAt);
  log("Got loading progress dialog");

  const progressInterval = setInterval(async () => {
    try {
      const text = await progressBar.getAttribute("value", { timeout: 100 });
      if (text === null) return;
      const textAsNumber = parseFloat(text);
      const finalText = Number.isNaN(textAsNumber) ? 0 : textAsNumber;
      log("progress", `${finalText * 100}%`);
    } catch {
      clearInterval(progressInterval);
    }
  }, 500);

  log("Waiting for progress dialog to disapear");
  const projectReadyStartedAt = Date.now();
  try {
    await waitForLocatorWithAbort(
      progressDialog,
      { state: "detached", timeout: timeoutMs },
      abortSignal,
    );
    logElapsed(log, "Construct project loading dialog dismissed after", projectReadyStartedAt);
  } finally {
    clearInterval(progressInterval);
  }
};

const delayWithAbort = async (duration: number, signal: AbortSignal) => {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, duration);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  throwIfAborted(signal);
};

const getOpenButton = async (page: Page) => {
  const candidates = [
    page.getByRole("button", { name: /^Open(?: project)?$/i }).first(),
    page.getByText("Open", { exact: true }).first(),
  ];
  for (const candidate of candidates) {
    if ((await candidate.isVisible()) && (await candidate.isEnabled())) return candidate;
  }
  return undefined;
};

const isConstructEditorReady = async (page: Page) => {
  const menuButton = page.getByRole("button", { name: "Menu", exact: true }).first();
  if (!(await menuButton.isVisible())) return false;

  // With the Start Page hidden, Construct opens directly into its editor shell.
  // Do not send the Open shortcut while its startup loading screen is visible.
  return !(await page.locator("#loadingLogoWrap").isVisible());
};

const waitForConstructReady = async (page: Page, signal: AbortSignal, log: typeof console.log) => {
  const startedAt = Date.now();
  const deadline = Date.now() + CONSTRUCT_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    let bodyText = "";
    try {
      bodyText = await page
        .locator("body")
        .innerText({ timeout: Math.min(500, deadline - Date.now()) });
    } catch (error) {
      if (isAbortError(error) || isRendererCrash(error)) throw error;
      // Construct replaces its startup document while loading; retry until it
      // presents either the project picker or a useful startup error.
    }

    if (/Oops!\s*There was an error loading Construct/i.test(bodyText)) {
      throw new Error("Construct displayed its startup error screen");
    }
    if (await getOpenButton(page)) {
      logElapsed(log, "Construct project picker ready after", startedAt);
      return;
    }
    if (await isConstructEditorReady(page)) {
      logElapsed(log, "Construct editor ready after", startedAt);
      return;
    }
    await delayWithAbort(Math.min(250, Math.max(1, deadline - Date.now())), signal);
  }
  log(
    `Construct did not show a ready editor or its Open control within ${CONSTRUCT_READY_TIMEOUT_MS / 1000} seconds; continuing with Ctrl+O`,
  );
};

const waitForFileChooserAfter = async (
  page: Page,
  signal: AbortSignal,
  trigger: () => Promise<unknown>,
) => {
  throwIfAborted(signal);
  const chooserController = new AbortController();
  const abortChooserWait = () => chooserController.abort(signal.reason);
  signal.addEventListener("abort", abortChooserWait, { once: true });
  if (signal.aborted) abortChooserWait();
  const chooserResult = page
    .waitForEvent("filechooser", {
      timeout: FILE_CHOOSER_TIMEOUT_MS,
      signal: chooserController.signal,
    })
    .then((fileChooser) => ({ fileChooser }))
    .catch((error: unknown) => ({ error }));

  try {
    const triggerResult = trigger()
      .then(() => ({ triggered: true as const }))
      .catch((error: unknown) => ({ triggerError: error }));
    const firstResult = await Promise.race([chooserResult, triggerResult]);
    throwIfAborted(signal);
    if ("fileChooser" in firstResult) return firstResult.fileChooser;

    if ("triggerError" in firstResult) {
      chooserController.abort();
      // Observe the cancelled event wait so it cannot become an unhandled rejection.
      await chooserResult;
      if (isRendererCrash(firstResult.triggerError)) throw firstResult.triggerError;
      return undefined;
    }

    // A successful trigger is not proof that Construct opened its native
    // picker; keep waiting for the event, but never beyond the configured cap.
    const result = await chooserResult;
    throwIfAborted(signal);
    if ("fileChooser" in result) return result.fileChooser;
    if (isAbortError(result.error)) throw result.error;
    if (isRendererCrash(result.error)) throw result.error;
    return undefined;
  } finally {
    signal.removeEventListener("abort", abortChooserWait);
    chooserController.abort();
  }
};

/** Open the Construct file picker reliably, with bounded recovery for missed UI events. */
export const openConstructProjectFile = async (
  page: Page,
  filePath: string,
  signal: AbortSignal,
  log: typeof console.log,
  diagnosticsDir: string,
) => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= OPEN_RETRY_COUNT; attempt++) {
    throwIfAborted(signal);
    try {
      await waitForConstructReady(page, signal, log);
      const chooserStartedAt = Date.now();
      let fileChooser = await waitForFileChooserAfter(page, signal, () =>
        page.keyboard.press("ControlOrMeta+O"),
      );

      if (!fileChooser) {
        const openButton = await getOpenButton(page);
        if (openButton) {
          log('Ctrl+O did not produce a file chooser; trying Construct "Open" button');
          fileChooser = await waitForFileChooserAfter(page, signal, () =>
            openButton.click({ timeout: 5_000 }),
          );
        }
      }

      if (fileChooser) {
        logElapsed(log, "Construct project file chooser opened after", chooserStartedAt);
        log("filechooser");
        const fileSelectionStartedAt = Date.now();
        await fileChooser.setFiles([filePath]);
        logElapsed(log, "Construct project file selected after", fileSelectionStartedAt);
        throwIfAborted(signal);
        log("Set file");
        return;
      }
      lastError = new Error("Construct did not open a file chooser from Ctrl+O or its Open button");
    } catch (error) {
      if (isAbortError(error) || isRendererCrash(error)) throw error;
      lastError = error;
    }

    if (page.isClosed()) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Construct page closed while opening the project");
    }
    if (attempt < OPEN_RETRY_COUNT) {
      log(`Construct file picker did not open; reloading once and retrying (${String(lastError)})`);
      const reloadStartedAt = Date.now();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
      logElapsed(log, "Construct recovery reload ready after", reloadStartedAt);
      continue;
    }
  }

  const screenshotPath = join(diagnosticsDir, `construct-open-failure-${Date.now()}.png`);
  let screenshotDetails = "";
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5_000 });
    screenshotDetails = ` Screenshot: ${screenshotPath}`;
  } catch (error) {
    if (isRendererCrash(error)) throw error;
    screenshotDetails = ` Screenshot capture failed: ${String(error)}`;
  }
  const reason =
    lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  throw new Error(
    `Could not open Construct project file after one reload: ${reason}.${screenshotDetails}`,
  );
};

export const script = async (
  page: Page,
  log: typeof console.log,
  filePath: string,
  username: string | undefined,
  password: string | undefined,
  version: string | undefined,
  downloadDir: string,
  abortSignal: AbortSignal,
  exportTimeoutMs: number,
) => {
  throwIfAborted(abortSignal);
  let url = "https://editor.construct.net/";
  if (version) {
    url += version;
  }

  const accountOrigin = constructAccountOrigin(version);
  const apiStartedAt = Date.now();
  const apiLogin: Promise<ConstructLoginResult> | undefined =
    username && password
      ? requestConstructLogin(
          username,
          password,
          abortSignal,
          CONSTRUCT_API_TIMEOUT_MS,
          accountOrigin,
        ).then(
          (loginData) => ({ loginData, startedAt: apiStartedAt }),
          (error: unknown) => ({ error, startedAt: apiStartedAt }),
        )
      : undefined;
  const authenticationStartedAt = username && password ? Date.now() : undefined;
  await prepareConstructEditor(
    page,
    version,
    username,
    password,
    apiLogin,
    abortSignal,
    log,
  );
  throwIfAborted(abortSignal);

  if (authenticationStartedAt !== undefined) {
    logElapsed(log, "Construct auth/editor startup after", authenticationStartedAt);
  }

  registerConfirmDialogListener(page, log);
  registerNotNowListener(page, log);
  registerInstallButtonListener(page, log);
  registerWebglErrorListener(page, log);
  registerDeprecatedFeatures(page, log);

  log("after event");
  const projectOpenStartedAt = Date.now();
  await openConstructProjectFile(page, filePath, abortSignal, log, downloadDir);
  await waitForConstructProjectLoad(page, exportTimeoutMs, abortSignal, log);
  logElapsed(log, "Construct project opened after", projectOpenStartedAt);

  const freeEditionDialog = page.locator("#okDialog");
  if (await freeEditionDialog.isVisible()) {
    const dialogText = await freeEditionDialog.innerText();
    if (isConstructFreeEditionLimit(dialogText)) {
      throw new Error(
        "Construct reports that this project exceeds the free edition limits. Verify that the selected account has a plan that covers this project.",
      );
    }
  }

  const missingAddonsDialog = page.locator("#missingAddonsDialog");
  if (await missingAddonsDialog.isVisible()) {
    const details = (await missingAddonsDialog.innerText()).trim();
    throw new Error(`Construct reports a missing addon${details ? `: ${details}` : ""}`);
  }

  const exportOptionsStartedAt = Date.now();
  const exportMenuStartedAt = Date.now();
  let actionStartedAt = Date.now();
  await page.getByRole("button", { name: "Menu" }).click();
  logElapsed(log, "Construct menu button click after", actionStartedAt);
  actionStartedAt = Date.now();
  await page.getByRole("menuitem", { name: "Project" }).click();
  logElapsed(log, "Construct Project menu click after", actionStartedAt);
  actionStartedAt = Date.now();
  await page.getByRole("menuitem", { name: "Export" }).click();
  logElapsed(log, "Construct Export menu click after", actionStartedAt);
  log('"Export" clicked');
  logElapsed(log, "Construct export menu selection after", exportMenuStartedAt);
  const exportPlatformStartedAt = Date.now();
  actionStartedAt = Date.now();
  const webExportOption = page
    .locator("ui-iconviewitem")
    .filter({ hasText: "Web (HTML5)" })
    .locator("ui-icon");
  try {
    const optionTimeoutMs = Math.min(exportTimeoutMs, 30_000);
    await webExportOption.waitFor({ state: "visible", timeout: optionTimeoutMs });
    await webExportOption.click({ timeout: optionTimeoutMs });
  } catch (error) {
    if (abortSignal.aborted) throw createAbortError(abortSignal);
    if (isAbortError(error) || isRendererCrash(error) || page.isClosed()) throw error;
    const [pageText, exportItems] = await Promise.all([
      page
        .locator("body")
        .innerText({ timeout: 2_000 })
        .catch(() => ""),
      page
        .locator("ui-iconviewitem")
        .allInnerTexts()
        .catch((): string[] => []),
    ]);
    const context = pageText.replace(/\s+/g, " ").trim().slice(0, 500);
    const screenshotPath = join(downloadDir, `construct-export-option-failure-${Date.now()}.png`);
    let screenshotDetails = "";
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5_000 });
      screenshotDetails = ` Screenshot: ${screenshotPath}`;
    } catch {
      // Keep the selection failure details if the page can no longer be captured.
    }
    throw new Error(
      `Could not select Construct's Web (HTML5) export option after opening the Export menu.${exportItems.length ? ` Options: ${JSON.stringify(exportItems)}.` : ""}${context ? ` Page says: ${context}.` : ""}${screenshotDetails}${error instanceof Error ? ` (${error.message})` : ""}`,
    );
  }
  logElapsed(log, "Construct Web platform click after", actionStartedAt);
  log('"Web" clicked');

  const platformDialog = page.locator("#exportSelectPlatformDialog");
  log("Waiting for Construct's export platform dialog");
  const platformDialogStartedAt = Date.now();
  try {
    await platformDialog.waitFor({ state: "visible", timeout: 30_000 });
    logElapsed(log, "Construct platform dialog ready after", platformDialogStartedAt);
  } catch (error) {
    const pageText = await page
      .locator("body")
      .innerText({ timeout: 2_000 })
      .catch(() => "");
    const context = pageText.replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(
      `Construct did not open the export platform dialog after selecting Web${context ? `; page says: ${context}` : ""}${error instanceof Error ? ` (${error.message})` : ""}`,
    );
  }

  const platformNext = platformDialog.getByRole("button", { name: "Next" });
  try {
    const platformNextStartedAt = Date.now();
    await platformNext.waitFor({ state: "visible", timeout: 30_000 });
    if (!(await platformNext.isEnabled())) {
      throw new Error("the Next button is disabled");
    }
    await platformNext.click({ timeout: 30_000 });
    logElapsed(log, "Construct platform Next click after", platformNextStartedAt);
  } catch (error) {
    throw new Error(
      `Construct's export platform dialog did not become ready${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
  logElapsed(log, "Construct export platform selection after", exportPlatformStartedAt);
  log("Export platform selected");

  const postPlatformText = await page
    .locator("body")
    .innerText({ timeout: 2_000 })
    .catch(() => "");
  if (isConstructFreeEditionLimit(postPlatformText)) {
    throw new Error(
      "Construct reports that this project exceeds the free edition limits. Verify that the selected account has a plan that covers this project.",
    );
  }

  const standardOptionsStartedAt = Date.now();
  const standardOptionsDialog = page.locator("#exportStandardOptionsDialog");
  log("Waiting for Construct's standard export options");
  const standardOptionsDialogStartedAt = Date.now();
  try {
    await standardOptionsDialog.waitFor({ state: "visible", timeout: 30_000 });
    logElapsed(
      log,
      "Construct standard options dialog ready after",
      standardOptionsDialogStartedAt,
    );
  } catch (error) {
    const pageText = await page
      .locator("body")
      .innerText({ timeout: 2_000 })
      .catch(() => "");
    const context = pageText.replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(
      `Construct did not open the standard export options after selecting the platform${context ? `; page says: ${context}` : ""}${error instanceof Error ? ` (${error.message})` : ""}`,
    );
  }

  const offlineSupport = standardOptionsDialog.getByLabel("Offline support");
  log("Waiting for the Offline support option");
  const offlineSupportStartedAt = Date.now();
  try {
    await offlineSupport.waitFor({ state: "visible", timeout: 10_000 });
    if (!(await offlineSupport.isEnabled())) {
      throw new Error("the Offline support option is disabled");
    }
    if (await offlineSupport.isChecked()) await offlineSupport.uncheck({ timeout: 10_000 });
    logElapsed(log, "Construct offline option ready after", offlineSupportStartedAt);
  } catch (error) {
    const dialogText = await standardOptionsDialog.innerText({ timeout: 2_000 }).catch(() => "");
    const context = dialogText.replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(
      `Construct's standard export options did not expose an available Offline support option${context ? `; dialog says: ${context}` : ""}${error instanceof Error ? ` (${error.message})` : ""}`,
    );
  }
  log("Disabled offline support");

  const optionsNext = standardOptionsDialog.getByRole("button", { name: "Next" });
  log("Waiting for Construct's export options Next button");
  const optionsNextStartedAt = Date.now();
  await optionsNext.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await optionsNext.isEnabled()))
    throw new Error("Construct's export options Next button is disabled");
  await optionsNext.click({ timeout: 30_000 });
  logElapsed(log, "Construct final Next click after", optionsNextStartedAt);
  logElapsed(log, "Construct standard export options selection after", standardOptionsStartedAt);
  logElapsed(log, "Construct Web export options selected after", exportOptionsStartedAt);
  log('"Next" clicked');
  log("Waiting for Construct to finish preparing its project download");
  const downloadButton = await waitForConstructExportDownload(
    page,
    exportTimeoutMs,
    downloadDir,
    abortSignal,
  );
  const download = await clickConstructDownload(page, downloadButton, exportTimeoutMs);
  await page.getByRole("button", { name: "OK" }).click();
  log('"Download" clicked');

  const finalPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(finalPath);
  log("File Downloaded");

  await page.close();
  return finalPath;
};
