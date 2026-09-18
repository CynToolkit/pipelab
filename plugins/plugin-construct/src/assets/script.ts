import { Page } from "playwright";
import { join } from "node:path";
import {
  registerInstallButtonListener,
  registerSaveLoginExpiredistener,
  registerWebglErrorListener,
  registerDeprecatedFeatures,
  registerWelcomeToConstructListener,
  registerNewVersionAvailableListener,
  registerNotNowListener,
} from "./listeners.js";

const CONSTRUCT_READY_TIMEOUT_MS = 15_000;
const FILE_CHOOSER_TIMEOUT_MS = 5_000;
const OPEN_RETRY_COUNT = 1;

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

const waitForConstructReady = async (page: Page, signal: AbortSignal, log: typeof console.log) => {
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
      log("Construct project picker is ready");
      return;
    }
    await delayWithAbort(Math.min(250, Math.max(1, deadline - Date.now())), signal);
  }
  log(
    `Construct did not show its Open control within ${CONSTRUCT_READY_TIMEOUT_MS / 1000} seconds; continuing with Ctrl+O`,
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
      let fileChooser;
      const openButton = await getOpenButton(page);
      if (openButton) {
        log('Clicking Construct "Open" button');
        fileChooser = await waitForFileChooserAfter(page, signal, () =>
          openButton.click({ timeout: 5_000 }),
        );
      }

      if (!fileChooser) {
        log("Open button did not produce a file chooser; trying Ctrl+O");
        fileChooser = await waitForFileChooserAfter(page, signal, () =>
          page.keyboard.press("ControlOrMeta+O"),
        );
      }

      if (fileChooser) {
        log("filechooser");
        await fileChooser.setFiles([filePath]);
        throwIfAborted(signal);
        log("Set file");
        return;
      }
      lastError = new Error("Construct did not open a file chooser from its Open button or Ctrl+O");
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
      await page.reload({ waitUntil: "load", timeout: 15_000 });
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
) => {
  let url = "https://editor.construct.net/";
  if (version) {
    url += version;
  }
  log("Navigating to URL", url);
  await page.goto(url, { waitUntil: "load" });
  log("after navigating, current URL:", page.url());

  if (username && password) {
    // Wait for localforage to be available before checking existing auth state.
    await page.waitForFunction(() => typeof localforage !== "undefined", { timeout: 30000 });

    // If a custom profile was used, the IndexedDB may already contain a valid
    // login session — skip the API call if credentials are already present.
    const alreadyLoggedIn = await page.evaluate(async () => {
      const data = await localforage.getItem("login-data");
      return data != null;
    });

    if (alreadyLoggedIn) {
      log("Already authenticated via copied profile, skipping login");
    } else {
      log("Directly authenticating via Construct 3 account API...");
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);
      formData.append("productType", "games");

      const res = await fetch("https://account.construct.net/login.json", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as any;
      if (json.request.status !== "ok") {
        throw new Error(json.request.errorMessage || "Invalid credentials");
      }

      const { userID, token } = json.response;
      log("API login successful, injecting credentials into browser context...");
      log("Current URL before injection:", page.url());

      // Inject credentials using the editor's own localforage instance
      await page.evaluate(
        async ({ userID, token }) => {
          await localforage.setItem("login-data", { userID, token });
        },
        { userID, token },
      );
      log("Credentials injected successfully.");

      // Reload to pick up the new login state
      log("Reloading page to apply login state...");
      await page.reload();
      log("Page reloaded.");
    }
  }

  registerWelcomeToConstructListener(page, log);
  registerNewVersionAvailableListener(page, log);
  registerNotNowListener(page, log);
  registerInstallButtonListener(page, log);
  registerWebglErrorListener(page, log);
  registerDeprecatedFeatures(page, log);
  registerSaveLoginExpiredistener(page, log);

  log("after event");
  await openConstructProjectFile(page, filePath, abortSignal, log, downloadDir);

  const progressDialog = page.locator("#progressDialog");
  const progessBar = progressDialog.locator(".progressBar");

  log("Waiting for progress dialog");
  await progressDialog.waitFor({
    timeout: 0,
  });
  log("Got loading progress dialog");

  const progressInterval = setInterval(async () => {
    try {
      const text = await progessBar.getAttribute("value", { timeout: 100 });
      if (text === null) return;
      const textAsNumber = parseFloat(text);
      const finalText = Number.isNaN(textAsNumber) ? 0 : textAsNumber;
      log("progress", `${finalText * 100}%`);
    } catch {
      clearInterval(progressInterval);
    }
  }, 500);

  log("Waiting for progress dialog to disapear");
  await progressDialog.waitFor({
    state: "detached",
    timeout: 0,
  });
  log("Got progress dialog to disapear");
  clearInterval(progressInterval);

  const missingAddonsDialog = page.locator("#missingAddonsDialog");
  if (await missingAddonsDialog.isVisible()) {
    const details = (await missingAddonsDialog.innerText()).trim();
    throw new Error(`Construct reports a missing addon${details ? `: ${details}` : ""}`);
  }

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Project" }).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  log('"Export" clicked');
  await page
    .locator("ui-iconviewitem")
    .filter({ hasText: "Web (HTML5)" })
    .locator("ui-icon")
    .click();
  log('"Web" clicked');

  const platformDialog = page.locator("#exportSelectPlatformDialog");
  log("Waiting for Construct's export platform dialog");
  try {
    await platformDialog.waitFor({ state: "visible", timeout: 30_000 });
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
    await platformNext.waitFor({ state: "visible", timeout: 30_000 });
    if (!(await platformNext.isEnabled())) {
      throw new Error("the Next button is disabled");
    }
    await platformNext.click({ timeout: 30_000 });
  } catch (error) {
    throw new Error(
      `Construct's export platform dialog did not become ready${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
  log("Export platform selected");

  const standardOptionsDialog = page.locator("#exportStandardOptionsDialog");
  log("Waiting for Construct's standard export options");
  try {
    await standardOptionsDialog.waitFor({ state: "visible", timeout: 30_000 });
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
  try {
    await offlineSupport.waitFor({ state: "visible", timeout: 10_000 });
    if (!(await offlineSupport.isEnabled())) {
      throw new Error("the Offline support option is disabled");
    }
    if (await offlineSupport.isChecked()) await offlineSupport.uncheck({ timeout: 10_000 });
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
  await optionsNext.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await optionsNext.isEnabled()))
    throw new Error("Construct's export options Next button is disabled");
  await optionsNext.click({ timeout: 30_000 });
  log('"Next" clicked');
  log("Waiting for Construct's export download");
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".downloadExportedProject").click({ timeout: 30_000 });
  const download = await downloadPromise;
  await page.getByRole("button", { name: "OK" }).click();
  log('"Download" clicked');

  const finalPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(finalPath);
  log("File Downloaded");

  await page.close();
  return finalPath;
};
