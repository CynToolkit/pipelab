const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");
workspaceRequire("tsx/cjs");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5175";
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const {
  default: { catalog, providers },
} = require("../../src/generated/release-provider-specs.ts");

(async () => {
  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = [];
  const errors = [];
  let inspectRequest;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico"))
      errors.push(message.text());
  });

  await context.routeWebSocket(/33753/, (socket) => {
    socket.send(JSON.stringify({ type: "connected" }));
    socket.onMessage((raw) => {
      const request = JSON.parse(raw);
      calls.push(request.channel);
      let result = {};
      switch (request.channel) {
        case "auth:getUser":
          result = { user: null };
          break;
        case "agent:version:get":
          result = { version: "test", channel: "stable" };
          break;
        case "settings:load":
          result = { version: "8.0.0", theme: "light", locale: "en-US", agents: [] };
          break;
        case "projects:load":
          result = {
            version: "4.0.0",
            projects: [{ id: "connected-project", name: "Connected project", description: "" }],
            workflows: [],
          };
          break;
        case "connections:load":
          result = { version: "1.0.0", connections: [] };
          break;
        case "fs:getHomeDirectory":
          result = { path: "/home/test" };
          break;
        case "providers:metadata:get":
          result = { providers };
          break;
        case "release:catalog:get":
          result = catalog;
          break;
        case "fs:getRoots":
          result = { roots: [{ name: "Home", path: "/home/test" }] };
          break;
        case "fs:listDirectory":
          result = {
            files: [
              {
                name: "Godot project",
                isDirectory: true,
                isSymbolicLink: false,
                size: 0,
                mtime: 0,
              },
            ],
          };
          break;
        case "release:producer:inspect":
          inspectRequest = request.data;
          result = {
            issues: [],
            fieldOptions: { preset: [{ label: "Web", value: "Web" }] },
          };
          break;
        default:
          break;
      }
      socket.send(
        JSON.stringify({
          type: "response",
          requestId: request.requestId,
          events: { type: "end", data: { type: "success", result } },
        }),
      );
    });
    setTimeout(
      () =>
        socket.send(
          JSON.stringify({ type: "event", channel: "startup:progress", data: { type: "done" } }),
        ),
      100,
    );
  });

  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Project overview", exact: true }).waitFor();
    await page
      .getByRole("button", { name: /New workflow/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "New release" });
    await dialog.getByLabel("Name", { exact: true }).fill("Connected browser draft");
    await dialog.locator(".wizard-panel:visible").getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: /Godot project/ }).click();
    await dialog.getByRole("button", { name: /Choose project path/i }).click();
    const picker = page.getByRole("dialog").last();
    await picker.getByRole("row", { name: /Godot project/ }).click();
    await picker.getByRole("button", { name: "Open" }).click();
    const projectPath = dialog.getByRole("textbox", { name: "Project path" });
    assert.equal(await projectPath.inputValue(), "/home/test/Godot project");
    await dialog.locator(".wizard-panel:visible").getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: /Godot exporter/ }).click();
    const preset = dialog.getByRole("combobox", { name: "Godot export preset" });
    await preset.waitFor();
    await preset.click();
    await page.getByRole("option", { name: "Web", exact: true }).waitFor();
    assert.ok(inspectRequest, "the connected browser requested dynamic producer inspection");
    assert.equal(inspectRequest.provider, "@pipelab/plugin-godot/producer");
    await page.getByRole("option", { name: "Web", exact: true }).click();
    const inspectionCallsBeforeEdits = calls.filter(
      (channel) => channel === "release:producer:inspect",
    ).length;
    for (const target of ["linux-x64", "macos-arm64", "windows-x64"]) {
      await dialog.getByRole("button", { name: new RegExp(target) }).click();
    }
    await preset.click();
    await page.getByRole("option", { name: "Web", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    assert.equal(
      calls.filter((channel) => channel === "release:producer:inspect").length -
        inspectionCallsBeforeEdits,
      1,
      "rapid target edits are coalesced into one producer inspection",
    );
    await dialog.locator(".wizard-panel:visible").getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: /^Steam/ }).click();
    await dialog
      .getByText("Account selection is available in Configuration after creating the workflow.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await dialog.getByRole("button", { name: "Add" }).count(),
      0,
      "the connected wizard also defers account creation instead of showing an inert control",
    );
    await dialog.locator(".wizard-panel:visible").getByRole("button", { name: "Back" }).click();
    await dialog.locator(".wizard-panel:visible").getByRole("button", { name: "Back" }).click();
    const sourceField = dialog
      .locator(".release-field")
      .filter({ hasText: "Project path" })
      .first();
    await sourceField.locator("details.environment-advanced summary").click();
    await sourceField.getByRole("checkbox", { name: "Use environment variable" }).check();
    await sourceField
      .getByLabel("Environment variable", { exact: true })
      .fill("GODOT_PROJECT_PATH");
    const inspectionsBeforeEnvironmentBinding = calls.filter(
      (channel) => channel === "release:producer:inspect",
    ).length;
    await dialog.locator(".wizard-panel:visible").getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(350);
    assert.equal(
      calls.filter((channel) => channel === "release:producer:inspect").length,
      inspectionsBeforeEnvironmentBinding,
      "provider inspection is deferred when the initiating client's source path is environment-bound",
    );
    assert.ok(calls.includes("release:catalog:get"));
    assert.deepEqual(errors, [], `browser had no JS errors: ${errors.join("; ")}`);
    console.log(
      "Connected hosted browser passed: runtime build options loaded and destination account setup was clearly deferred.",
    );
  } catch (error) {
    console.error("Connected journey requests:", calls.join(", "));
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
