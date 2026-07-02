import { Page } from "playwright";
import { join } from "node:path";
import {
  registerInstallButtonListener,
  registerSaveLoginExpiredistener,
  registerWebglErrorListener,
  registerDeprecatedFeatures,
  registerWelcomeToConstructListener,
  registerMissingAddonErrorListener,
  registerNewVersionAvailableListener,
  registerNotNowListener,
} from "./listeners.js";

export const script = async (
  page: Page,
  log: typeof console.log,
  filePath: string,
  username: string | undefined,
  password: string | undefined,
  version: string | undefined,
  downloadDir: string,
) => {
  if (username && password) {
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

    // Navigate to account.construct.net to set the origin context for IndexedDB
    await page.goto("https://account.construct.net/");

    // Inject token into IndexedDB
    await page.evaluate(
      async ({ userID, token }) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("localforage", 1);
          request.onerror = () => reject(new Error("Failed to open DB"));
          request.onsuccess = (e: any) => {
            const db = e.target.result;
            try {
              const transaction = db.transaction(["keyvaluepairs"], "readwrite");
              const store = transaction.objectStore("keyvaluepairs");
              const putRequest = store.put({ userID, token }, "login-data");
              putRequest.onsuccess = () => resolve();
              putRequest.onerror = () => reject(new Error("Failed to put item"));
            } catch (err) {
              reject(err);
            }
          };
          request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            db.createObjectStore("keyvaluepairs");
          };
        });
      },
      { userID, token },
    );
    log("Credentials injected successfully.");
  }

  let url = "https://editor.construct.net/";
  if (version) {
    url += version;
  }
  log("Navigating to URL", url);
  await page.goto(url);
  log("after navigating");

  registerWelcomeToConstructListener(page, log);
  registerNewVersionAvailableListener(page, log);
  registerNotNowListener(page, log);

  log("after event");

  await page.waitForTimeout(2000);

  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.keyboard.press("ControlOrMeta+O"),
  ]);
  log("filechooser");

  console.log("filePath", filePath);
  await fileChooser.setFiles([filePath]);
  log("Set file");

  // await page.getByText("Not now").click({
  //   timeout: 1000
  // });

  const progressDialog = page.locator("#progressDialog");
  // <progress class="progressBar" value="0.293996941070648" max="1"></progress>
  const progessBar = progressDialog.locator(".progressBar");

  log("Waiting for progress dialog");
  await progressDialog.waitFor({
    timeout: 0,
  });
  log("Got loading progress dialog");

  const progressInterval = setInterval(async () => {
    const text = await progessBar.getAttribute("value");
    const textAsNumber = parseFloat(text);
    const finalText = Number.isNaN(textAsNumber) ? 0 : textAsNumber;
    log("progress", `${finalText * 100}%`);
  }, 500);

  registerInstallButtonListener(page, log);
  registerWebglErrorListener(page, log);
  registerMissingAddonErrorListener(page, log);
  registerDeprecatedFeatures(page, log);
  registerSaveLoginExpiredistener(page, log);

  log("Waiting for progress dialog to disapear");
  await progressDialog.waitFor({
    state: "detached",
    timeout: 0,
  });
  log("Got progress dialog to disapear");
  clearTimeout(progressInterval);

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

  await page.locator("#exportSelectPlatformDialog").getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Offline support").uncheck();
  log("Disabled offline support");

  await page.locator("#exportStandardOptionsDialog").getByRole("button", { name: "Next" }).click();
  log('"Next" clicked');
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".downloadExportedProject").click();
  const download = await downloadPromise;
  await page.getByRole("button", { name: "OK" }).click();
  log('"Download" clicked');

  const finalPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(finalPath);
  log("File Downloaded");

  await page.close();
  return finalPath;
};
