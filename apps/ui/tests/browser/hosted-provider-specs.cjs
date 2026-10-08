const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5175";
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

(async () => {
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const sockets = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) {
      errors.push(message.text());
    }
    if (message.type() === "warning" && message.text().startsWith("[Vue warn]")) {
      errors.push(message.text());
    }
  });
  page.on("response", (response) => {
    // Vite's default index does not include a favicon; it is unrelated to app behavior.
    if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith("/favicon.ico")) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("websocket", (socket) => {
    // The Vite HMR socket carries a dev token; only count app sockets.
    if (!new URL(socket.url()).searchParams.has("token")) sockets.push(socket.url());
  });

  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("Hosted mode is ready.", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: /New workflow/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "New release" });
    await dialog.waitFor();

    await dialog.getByLabel("Name", { exact: true }).fill("Hosted provider-spec draft");
    await dialog.getByRole("button", { name: "Continue" }).click();
    const sourceCards = dialog.locator(".source-grid .choice-card");
    await sourceCards.first().waitFor();
    const sourceNames = await sourceCards.allInnerTexts();
    assert(
      sourceNames.some((name) => name.includes("Godot project")),
      "packaged source choices render",
    );
    await dialog.getByRole("button", { name: /Godot project/ }).click();
    await dialog.getByRole("textbox", { name: "Project path" }).fill("/tmp/provider-spec-project");
    await dialog.getByRole("button", { name: "Continue" }).click();

    const buildCards = dialog.locator(".wizard-panel .choice-card");
    await dialog.getByRole("heading", { name: "Configure a build" }).waitFor();
    assert((await buildCards.allInnerTexts()).some((name) => name.includes("Godot exporter")));
    await dialog.getByRole("button", { name: /Godot exporter/ }).click();
    await dialog
      .getByText("Availability: Unknown (agent required)", { exact: true })
      .first()
      .waitFor();
    await dialog.getByText("Godot export preset", { exact: true }).waitFor();
    await dialog.getByText("Options require a connected Pipelab agent.", { exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/pipelab-hosted-build-specs.png", fullPage: true });
    await dialog.getByRole("button", { name: "Continue" }).click();

    await dialog.getByRole("heading", { name: "Where do you want to ship?" }).waitFor();
    const destinationRows = dialog.locator(".destination-row");
    assert((await destinationRows.allInnerTexts()).some((name) => name.includes("Itch.io")));
    await dialog.getByRole("button", { name: /Itch.io/ }).click();
    await dialog.getByRole("textbox", { name: "Project", exact: true }).fill("studio/game");
    await dialog
      .getByText("These settings remain in the browser draft until connected to an agent.", {
        exact: true,
      })
      .waitFor();
    await page.screenshot({ path: "/tmp/pipelab-hosted-destination-specs.png", fullPage: true });
    await dialog.getByRole("button", { name: "Continue" }).click();

    await dialog.getByRole("heading", { name: "Review your choices" }).waitFor();
    const recap = dialog.locator(".wizard-panel").last();
    await recap.getByText("Godot exporter", { exact: true }).waitFor();
    await recap.getByText("Itch.io", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: "Create workflow" }).isDisabled(), true);
    await dialog
      .getByText("Runtime checks and saving this draft require a Pipelab agent.", {
        exact: true,
      })
      .waitFor();
    assert.deepEqual(sockets, [], `hosted mode opened no agent WebSockets: ${sockets.join(", ")}`);
    assert.deepEqual(errors, [], `browser had no JS errors: ${errors.join("; ")}`);
    console.log(
      "Hosted provider-spec draft passed: packaged sources, build fields, and destinations rendered without an agent or catalog endpoint.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
