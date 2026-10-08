const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5175";
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

async function main() {
  const browser = await chromium.launch({ executablePath: chromiumPath, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const websocketUrls = [];
    page.on("websocket", (socket) => {
      // Vite's own HMR socket carries a dev token; track app sockets only.
      if (!new URL(socket.url()).searchParams.has("token")) websocketUrls.push(socket.url());
    });

    await page.goto(`${baseUrl}/dashboard`);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(".route-content").getAttribute("inert"), null);
    const loginButton = page.locator("button.login-btn");
    if ((await loginButton.count()) > 0) assert.equal(await loginButton.isDisabled(), true);
    assert.match(
      await page.getByText("Browser sign-in is not available yet.").textContent(),
      /not available yet/,
    );
    assert.equal(websocketUrls.length, 0, `expected no agent sockets, saw ${websocketUrls.length}`);

    await page.getByRole("link", { name: "Connections" }).click();
    await page.waitForURL("**/connections");
    assert.equal(await page.locator(".route-content").getAttribute("inert"), null);
    assert.equal(
      websocketUrls.length,
      0,
      `navigation started ${websocketUrls.length} agent sockets`,
    );

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Toggle dark mode").click();
    assert.equal(
      await page.locator("html").evaluate((element) => element.classList.contains("dark")),
      true,
    );
    await page.locator("#language-select").click();
    await page.locator('[role="option"][aria-label="fr-FR"]').click();
    assert.equal(await page.locator("#language-select").getAttribute("aria-label"), "fr-FR");
    await page.reload();
    assert.equal(
      await page.locator("html").evaluate((element) => element.classList.contains("dark")),
      true,
    );
    assert.equal(
      websocketUrls.length,
      0,
      `page reload started ${websocketUrls.length} agent sockets`,
    );
    await page.getByRole("button", { name: "Settings" }).click();
    assert.equal(await page.locator("#language-select").getAttribute("aria-label"), "fr-FR");

    const restrictedContext = await browser.newContext();
    await restrictedContext.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("storage unavailable");
      };
    });
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto(`${baseUrl}/dashboard`);
    await restrictedPage.getByRole("button", { name: "Settings" }).click();
    await restrictedPage.getByLabel("Toggle dark mode").click();
    assert.equal(
      await restrictedPage
        .locator("html")
        .evaluate((element) => element.classList.contains("dark")),
      false,
    );
    assert.match(await restrictedPage.getByRole("alert").textContent(), /was not changed/);
    await restrictedContext.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
