import type { Page } from "playwright";

export const registerInstallButtonListener = (page: Page, log: typeof console.log) => {
  const installDialog = page.locator("#addonConfirmInstallDialog");
  const installBtn = installDialog.locator(".okButton");
  installBtn
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      await installBtn.click();
      log("installBtn clicked");
      registerInstallButtonListener(page, log);
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("installBtn.click() failed", e.message);
    });
};

export const registerSaveLoginExpiredistener = (page: Page, log: typeof console.log) => {
  const installDialog = page.locator("#confirmDialog");
  const cancelBtn = installDialog.locator(".cancelConfirmButton");
  cancelBtn
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      await cancelBtn.click();
      log("cancelBtn clicked");
      registerSaveLoginExpiredistener(page, log);
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("cancelBtn.click() failed", e.message);
    });
};

export const registerWebglErrorListener = (page: Page, log: typeof console.log) => {
  const okDialog = page.locator("#okDialog");
  const webglErrorButton = okDialog.locator(".okButton");
  webglErrorButton
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      const text = await okDialog.allInnerTexts();

      if (text.join().toLowerCase().includes("webgl")) {
        await webglErrorButton.click();
        log("webglErrorButton clicked");
        registerWebglErrorListener(page, log);
      }
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("webglErrorButton.click() failed", e.message);
    });
};

export const registerDeprecatedFeatures = (page: Page, log: typeof console.log) => {
  const deprecatedFeaturesDialog = page.locator("#deprecatedFeaturesDialog");
  const okButton = deprecatedFeaturesDialog.locator(".okButton");
  okButton
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      await okButton.click();
      log("okButton clicked");
      registerDeprecatedFeatures(page, log);
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("deprecatedFeatures.okButton.click() failed", e.message);
    });
};

export const registerWelcomeToConstructListener = (page: Page, log: typeof console.log) => {
  const welcomeTourDialog = page.locator("#welcomeTourDialog");
  const okButton = welcomeTourDialog.locator(".noThanksLink");
  okButton
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      await okButton.click();
      log("okButton clicked");
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("welcomeTour.okButton.click() failed", e.message);
    });
};

export const registerMissingAddonErrorListener = (page: Page, log: typeof console.log) => {
  const okDialog = page.locator("#missingAddonsDialog");
  const webglErrorButton = okDialog.locator(".okButton");
  webglErrorButton
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      throw new Error("Missing addon. You should bundle addons with your project");
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("missingAddon.okButton.waitFor() failed", e.message);
    });
};

export const registerNewVersionAvailableListener = (page: Page, log: typeof console.log) => {
  const newVersionAvailableDialog = page.locator("#confirmDialog");
  const cancelButton = newVersionAvailableDialog.locator(".cancelConfirmButton");
  cancelButton
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      await cancelButton.click();
      log("cancelButton clicked");
      registerNewVersionAvailableListener(page, log);
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("cancelButton.click() failed", e.message);
    });
};

export const registerNotNowListener = (page: Page, log: typeof console.log) => {
  const notNowBtn = page.getByText("Not now");
  notNowBtn
    .waitFor({
      timeout: 0,
    })
    .then(async () => {
      await notNowBtn.click();
      log("notNowBtn clicked");
      registerNotNowListener(page, log);
    })
    .catch(async (e) => {
      if (e.message.includes("Target page, context or browser has been closed")) return;
      log("notNowBtn.click() failed", e.message);
    });
};
