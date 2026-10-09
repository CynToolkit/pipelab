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

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Release workspace", exact: true }).waitFor();
    assert.equal(await page.locator(".route-content").getAttribute("inert"), null);
    assert.equal(
      await page.getByRole("heading", { name: "Release workspace", exact: true }).count(),
      1,
    );
    assert.equal(await page.getByRole("heading", { name: "Workflows", exact: true }).count(), 1);
    assert.equal(await page.getByRole("combobox", { name: "Select Project" }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Project actions" }).isDisabled(), true);
    assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 1);
    const sidebarToggle = page.getByRole("button", { name: "Collapse sidebar" });
    await sidebarToggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("button", { name: "Expand sidebar" }).count(), 1);
    await page.keyboard.press("Space");
    assert.equal(await page.getByRole("button", { name: "Collapse sidebar" }).count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    const hostedNote = await page.locator(".hosted-account-note-trigger").boundingBox();
    assert.ok(hostedNote);
    assert.ok(hostedNote.x + hostedNote.width <= 390, "hosted status fits the narrow navigation");
    await page.setViewportSize({ width: 1280, height: 720 });
    const loginButton = page.locator("button.login-btn");
    if ((await loginButton.count()) > 0) assert.equal(await loginButton.isDisabled(), true);
    assert.match(
      await page.getByText("Browser sign-in requires a connected agent.").textContent(),
      /requires a connected agent/,
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
    assert.equal(await page.locator(".section-header h3").textContent(), "General");
    const restartTour = page.getByRole("button", { name: "Reset Dashboard Guide" });
    assert.equal(await restartTour.isDisabled(), true);
    assert.match(await restartTour.getAttribute("title"), /connect an agent/i);
    await page.getByLabel("Toggle dark mode").click();
    assert.equal(
      await page.locator("html").evaluate((element) => element.classList.contains("dark")),
      true,
    );
    await page.locator("#language-select").click();
    await page.locator('[role="option"][aria-label="fr-FR"]').click();
    assert.equal(await page.locator("#language-select").getAttribute("aria-label"), "fr-FR");
    assert.equal(await page.locator(".section-header h3").textContent(), "Général");
    await page.reload({ waitUntil: "domcontentloaded" });
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
    assert.equal(await page.locator(".section-header h3").textContent(), "Général");

    const restrictedContext = await browser.newContext();
    await restrictedContext.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("storage unavailable");
      };
    });
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
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
