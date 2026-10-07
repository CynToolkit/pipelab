const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { join, resolve } = require("node:path");
const workspaceRequire = createRequire(resolve(__dirname, "../../../../apps/website/package.json"));
const { chromium } = workspaceRequire("playwright");

const baseUrl = process.env.UI_BASE_URL || "http://127.0.0.1:5175";
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const projectId = "journey-project";
const waitForResolverStart = async (started) => {
  let timeout;
  try {
    await Promise.race([
      started,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out waiting for release:resolve-defaults")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};
const sourceFixtures = {
  folder: {
    id: "@pipelab/core/source/folder",
    label: "Folder",
    output: { kind: "files", container: "directory" },
    fields: [{ key: "path", label: "Folder path", type: "directory", required: true }],
    defaultConfig: { path: "" },
  },
  zip: {
    id: "@pipelab/core/source/zip",
    label: "ZIP",
    output: { kind: "files", container: "archive", format: "zip" },
    fields: [
      { key: "path", label: "ZIP path", type: "file", required: true, fileExtensions: ["zip"] },
    ],
    defaultConfig: { path: "" },
  },
  construct: {
    id: "@pipelab/plugin-construct/source",
    label: "Construct project",
    output: { kind: "application", platform: "web", container: "directory" },
    fields: [
      { key: "path", label: "Project file", type: "file", required: true, fileExtensions: ["c3p"] },
      { key: "profilePath", label: "Browser profile", type: "directory", deferUntilEditor: true },
    ],
    defaultConfig: { path: "", profilePath: "" },
  },
  godot: {
    id: "@pipelab/plugin-godot/source",
    label: "Godot project",
    output: { kind: "project", technology: "godot", container: "directory" },
    fields: [{ key: "path", label: "Project path", type: "directory", required: true }],
    defaultConfig: { path: "" },
  },
};

const catalog = {
  buildTypes: [],
  sources: Object.values(sourceFixtures),
  producers: [],
  destinations: [
    {
      id: "@pipelab/plugin-poki/destination",
      label: "Poki",
      accepts: {},
      fields: [{ key: "project", label: "Project", type: "text", required: true }],
      defaultConfig: { project: "" },
    },
  ],
};

async function journey(sourceKey, sourcePath) {
  const browser = await chromium.launch({ executablePath: chromiumPath, args: ["--no-sandbox"] });
  const narrow = sourceKey === "godot";
  const expectedTheme = narrow ? "dark" : "light";
  const context = await browser.newContext({
    viewport: { width: narrow ? 390 : 1280, height: 844 },
    colorScheme: expectedTheme,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const calls = [];
  const errors = [];
  let saved;
  let deferNextResolve = false;
  let pendingResolve;
  let signalResolveStarted;
  const resolverStarted = new Promise((resolve) => {
    signalResolveStarted = resolve;
  });

  page.on("pageerror", (error) => errors.push(error.message));
  await context.routeWebSocket(/33753/, (socket) => {
    socket.send(JSON.stringify({ type: "connected" }));
    socket.onMessage((raw) => {
      const request = JSON.parse(raw);
      calls.push(request.channel);
      let result = {};
      let holdResponse = false;
      switch (request.channel) {
        case "auth:getUser":
          result = { user: null };
          break;
        case "agent:version:get":
          result = { version: "test", channel: "stable" };
          break;
        case "settings:load":
          result = {
            version: "8.0.0",
            theme: expectedTheme,
            locale: "en-US",
            agents: [],
            tours: { dashboard: { completed: true }, editor: { completed: true } },
          };
          break;
        case "projects:load":
          result = {
            version: "4.0.0",
            projects: [{ id: projectId, name: "Journey project" }],
            workflows: [],
          };
          break;
        case "connections:load":
          result = { version: "1.0.0", connections: [] };
          break;
        case "providers:metadata:get":
          result = { providers: [] };
          break;
        case "release:catalog:get":
          result = catalog;
          break;
        case "release:source:inspect":
          result = { issues: [], fieldOptions: {} };
          break;
        case "release:resolve-defaults": {
          if (deferNextResolve) {
            deferNextResolve = false;
            holdResponse = true;
            pendingResolve = { socket, request };
            signalResolveStarted();
            break;
          }
          result = {
            ...request.data.config,
            builds: [
              {
                id: "fixture-default-build",
                type: "web",
                engine: "fixture:web",
                enabled: true,
                input: { source: true },
                config: { mode: "release" },
                targets: [{ id: "release", enabled: true, config: {} }],
              },
            ],
            destinations: request.data.config.destinations.map((destination) => ({
              ...destination,
              slots: destination.slots.map((slot) => ({ ...slot, input: { source: true } })),
            })),
          };
          break;
        }
        case "release:plan":
          result = {
            producers: [],
            outputs: [
              {
                ref: { source: true },
                artifactRef: { source: true },
                descriptor: sourceFixtures[sourceKey].output,
              },
            ],
            destinations: [],
            issues: [
              {
                code: "destination.project.required",
                path: "destinations.0.config.project",
                severity: "error",
                message: "Choose a Poki project before publishing.",
              },
            ],
            graph: {
              nodes: [
                { id: "source", kind: "source" },
                { id: "destination", kind: "destination" },
              ],
              edges: [{ from: "source", to: "destination" }],
            },
          };
          break;
        case "fs:getHomeDirectory":
          result = { path: "/test-home" };
          break;
        case "fs:getRoots":
          result = { roots: [{ name: "Home", path: "/test-home" }] };
          break;
        case "fs:listDirectory":
          result = {
            files: [
              { name: "demo.c3p", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
              { name: "demo.zip", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
              { name: "notes.txt", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
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
        case "workflow:save":
          saved = request.data.data;
          result = { success: true };
          break;
        case "workflow:load":
          result = saved;
          break;
      }
      if (!holdResponse)
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
    await page.goto(`${baseUrl}/`);
    await page.getByText("Journey project", { exact: true }).first().waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.classList.contains("dark")),
      expectedTheme === "dark",
      `${expectedTheme} theme is applied`,
    );
    await page
      .getByRole("button", { name: /New workflow/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "New release" });
    await dialog.waitFor();
    await page.getByLabel("Name", { exact: true }).fill(`${sourceKey} first workflow`);

    const sourceCard = dialog.getByRole("button", {
      name: new RegExp(sourceFixtures[sourceKey].label),
    });
    await sourceCard.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await sourceCard.getAttribute("aria-pressed"),
      "true",
      `${sourceKey} can be selected with the keyboard`,
    );
    assert.equal(
      await dialog.getByText("Browser profile", { exact: true }).count(),
      0,
      "deferred optional fields stay out of first-run setup",
    );
    assert.equal(
      await dialog.getByText("Description", { exact: true }).count(),
      0,
      "optional description is not requested",
    );

    const pickerButtonName = `Choose ${sourceFixtures[sourceKey].fields[0].label}`;
    await dialog.getByRole("button", { name: new RegExp(pickerButtonName, "i") }).click();
    const picker = page.getByRole("dialog").last();
    const selectedEntry =
      sourceKey === "construct" ? /demo\.c3p/ : sourceKey === "zip" ? /demo\.zip/ : /Godot project/;
    await picker.getByRole("row", { name: selectedEntry }).click();
    if (sourceKey === "construct" || sourceKey === "zip") {
      assert.equal(
        await picker.getByRole("row", { name: /notes\.txt/ }).count(),
        0,
        "file picker filters out unsupported extensions",
      );
      assert.equal(
        await picker
          .getByRole("row", { name: sourceKey === "construct" ? /demo\.zip/ : /demo\.c3p/ })
          .count(),
        0,
        "file picker hides other source formats",
      );
    } else {
      assert.equal(await picker.getByRole("row", { name: /notes\.txt/ }).count(), 1);
    }
    await picker.getByRole("button", { name: "Open" }).click();
    await dialog.locator("input[readonly]").first().waitFor();
    assert.equal(await dialog.locator("input[readonly]").first().inputValue(), sourcePath);
    const fsCalls = calls.filter((channel) => channel.startsWith("fs:"));
    assert.ok(
      fsCalls.includes("fs:listDirectory"),
      "the web picker loaded a directory from the mocked filesystem boundary",
    );
    // The visible picker enforces these constraints; the source schema declares the native picker mode and extension.
    const sourceField = sourceFixtures[sourceKey].fields[0];
    if (sourceKey === "construct" || sourceKey === "zip") {
      assert.equal(sourceField.type, "file");
      assert.deepEqual(sourceField.fileExtensions, [sourceKey === "construct" ? "c3p" : "zip"]);
    } else {
      assert.equal(sourceField.type, "directory");
    }

    if (sourceKey === "folder" || sourceKey === "zip") {
      assert.equal(
        await dialog.getByRole("button", { name: "Continue" }).isEnabled(),
        true,
        `${sourceKey} selection enables setup`,
      );
      return `${sourceKey}: source picker constraint passed`;
    }

    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("heading", { name: "Destinations" }).waitFor();
    await dialog.getByRole("button", { name: "Back" }).click();
    assert.equal(
      await dialog.locator("input[readonly]").first().inputValue(),
      sourcePath,
      "Back preserves source selection",
    );
    await dialog.getByRole("button", { name: "Continue" }).click();
    const destination = dialog.getByRole("button", { name: /^Poki/ });
    await destination.click();
    assert.equal(await destination.getAttribute("aria-pressed"), "true");
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("heading", { name: "Recap" }).waitFor();
    await dialog.getByText("Name", { exact: true }).last().waitFor();
    await dialog.getByText(`${sourceKey} first workflow`, { exact: true }).waitFor();
    await dialog.getByText(sourceFixtures[sourceKey].label, { exact: true }).last().waitFor();
    await dialog.getByText(sourcePath, { exact: false }).waitFor();
    await dialog.getByText("Poki", { exact: true }).last().waitFor();
    assert.equal(
      await dialog.getByRole("button", { name: "Edit" }).count(),
      0,
      "recap has no Edit action",
    );
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${sourceKey}-recap.png`),
      });
    const dialogBox = await dialog.boundingBox();
    if (narrow)
      assert.ok(dialogBox.width <= 390, `wizard fits narrow viewport: ${dialogBox.width}px`);
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "wizard does not cause horizontal page overflow",
    );

    await dialog.getByRole("button", { name: "Create workflow" }).click();
    await page.waitForURL(/\/workflows\//);
    await page.getByText("Action required", { exact: true }).waitFor();
    assert.equal((await page.locator(".workflow-readiness").innerText()).trim(), "Needs attention");
    assert.equal(
      await page.getByText("Ready to ship", { exact: true }).count(),
      0,
      "a plan blocker cannot show Ready to ship",
    );
    await page.getByRole("button", { name: "Configure destination" }).click();
    const destinationEditor = page.getByRole("dialog", { name: "Edit destination" });
    await destinationEditor.waitFor();
    await destinationEditor.getByLabel("Project", { exact: true }).waitFor();
    await page.waitForTimeout(250);
    assert.equal(
      await page.getByText("Invalid output reference", { exact: true }).count(),
      0,
      "mock plan resolves the configured source output",
    );
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${sourceKey}-configuration.png`),
      });
    assert.ok(saved, "workflow save was called");
    assert.equal(saved.source.provider, sourceFixtures[sourceKey].id);
    assert.equal(saved.source.config.path, sourcePath);
    assert.equal(
      saved.builds[0].id,
      "fixture-default-build",
      "resolved default build reaches workflow persistence",
    );
    assert.deepEqual(
      saved.destinations[0].slots[0].input,
      { source: true },
      "resolved output routing reaches workflow persistence",
    );
    assert.ok(calls.includes("workflow:save"));
    assert.ok(calls.includes("release:resolve-defaults"));
    assert.ok(calls.includes("release:plan"));
    assert.deepEqual(errors, [], `browser had no JS or console errors: ${errors.join("; ")}`);

    if (sourceKey === "construct") {
      await destinationEditor.getByRole("button", { name: "Done" }).click();
      await page.getByRole("link", { name: "Dashboard" }).click();
      await page.waitForURL(/\/dashboard$/);
      await page
        .getByRole("button", { name: /New workflow/ })
        .first()
        .click();
      const lateDialog = page.getByRole("dialog", { name: "New release" });
      await lateDialog.waitFor();
      await lateDialog.getByLabel("Name", { exact: true }).fill("Cancelled late workflow");
      await lateDialog.getByRole("button", { name: /Construct project/ }).click();
      await lateDialog.getByRole("button", { name: /Choose Project file/i }).click();
      const latePicker = page.getByRole("dialog").last();
      await latePicker.getByRole("row", { name: /demo\.c3p/ }).click();
      await latePicker.getByRole("button", { name: "Open" }).click();
      await lateDialog.getByRole("button", { name: "Continue" }).click();
      await lateDialog.getByRole("button", { name: /^Poki/ }).click();
      await lateDialog.getByRole("button", { name: "Continue" }).click();
      deferNextResolve = true;
      await lateDialog.getByRole("button", { name: "Create workflow" }).click();
      await waitForResolverStart(resolverStarted);
      await lateDialog.getByRole("button", { name: "Close" }).click();
      await lateDialog.waitFor({ state: "hidden" });
      const saveCount = calls.filter((channel) => channel === "workflow:save").length;
      const delayedConfig = pendingResolve.request.data.config;
      pendingResolve.socket.send(
        JSON.stringify({
          type: "response",
          requestId: pendingResolve.request.requestId,
          events: { type: "end", data: { type: "success", result: delayedConfig } },
        }),
      );
      await page.waitForTimeout(150);
      assert.equal(
        calls.filter((channel) => channel === "workflow:save").length,
        saveCount,
        "a late resolver response after close cannot save",
      );
      assert.match(page.url(), /\/dashboard$/);
      await page
        .getByRole("button", { name: /New workflow/ })
        .first()
        .click();
      const reopened = page.getByRole("dialog", { name: "New release" });
      await reopened.waitFor();
      assert.equal(
        await reopened.getByLabel("Name", { exact: true }).inputValue(),
        "",
        "reopening starts a fresh draft after a late result",
      );
      await reopened.getByRole("button", { name: "Close" }).click();
      assert.deepEqual(
        errors,
        [],
        `browser had no JS errors after cancellation: ${errors.join("; ")}`,
      );
    }
    return `${sourceKey}: keyboard selection, picker, recap, default resolution, and Configuration repair passed${sourceKey === "construct" ? "; late resolver cancellation passed" : ""}`;
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  const results = [];
  results.push(await journey("folder", "/test-home/Godot project"));
  results.push(await journey("zip", "/test-home/demo.zip"));
  results.push(await journey("construct", "/test-home/demo.c3p"));
  results.push(await journey("godot", "/test-home/Godot project"));
  for (const result of results) console.log(result);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
