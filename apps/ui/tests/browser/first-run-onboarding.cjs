const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
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
const waitForRequests = async (page, calls, channel, count) => {
  const deadline = Date.now() + 5000;
  while (calls.filter((item) => item === channel).length < count) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${channel} request ${count}; saw ${calls.join(", ")}`);
    await page.waitForTimeout(20);
  }
};
const configureSourcePath = async (page, calls, sourceKey, sourcePath) => {
  const source = sourceFixtures[sourceKey];
  const field = source.fields[0];
  await waitForRequests(page, calls, "release:source:inspect", 1);
  await waitForRequests(page, calls, "release:plan", 1);
  await page.locator(".source-card").getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit source" });
  await editor.getByRole("button", { name: new RegExp(`Choose ${field.label}`, "i") }).click();
  const picker = page.getByRole("dialog").last();
  const entry = sourcePath.endsWith(".c3p")
    ? /demo\.c3p/
    : sourcePath.endsWith(".zip")
      ? /demo\.zip/
      : /Godot project/;
  await picker.getByRole("row", { name: entry }).click();
  if (field.type === "file") {
    assert.equal(await picker.getByRole("row", { name: /notes\.txt/ }).count(), 0);
    assert.equal(
      await picker
        .getByRole("row", { name: sourceKey === "construct" ? /demo\.zip/ : /demo\.c3p/ })
        .count(),
      0,
      `${sourceKey} picker hides incompatible file formats`,
    );
  }
  await picker.getByRole("button", { name: "Open" }).click();
  assert.equal(await editor.locator("input[readonly]").inputValue(), sourcePath);
  await editor.getByRole("button", { name: "Done" }).click();
  await waitForRequests(page, calls, "release:source:inspect", 2);
  await waitForRequests(page, calls, "release:plan", 2);
  await waitForRequests(page, calls, "workflow:save", 2);
};
const sourceFixtures = {
  folder: {
    id: "@pipelab/core/source/folder",
    label: "Folder",
    description: "A local folder",
    icon: { type: "icon", icon: "mdi mdi-folder-outline" },
    output: { kind: "files", container: "directory" },
    fields: [{ key: "path", label: "Folder path", type: "directory", required: true }],
    defaultConfig: { path: "" },
  },
  webFolder: {
    id: "@pipelab/core/source/web-folder",
    label: "Web app folder",
    description: "A web app folder",
    icon: { type: "icon", icon: "mdi mdi-web" },
    output: { kind: "application", platform: "web", container: "directory" },
    fields: [{ key: "path", label: "Folder path", type: "directory", required: true }],
    defaultConfig: { path: "" },
  },
  zip: {
    id: "@pipelab/core/source/zip",
    label: "ZIP",
    description: "A ZIP file",
    icon: { type: "icon", icon: "mdi mdi-file-archive-outline" },
    output: { kind: "files", container: "archive", format: "zip" },
    fields: [
      { key: "path", label: "ZIP path", type: "file", required: true, fileExtensions: ["zip"] },
    ],
    defaultConfig: { path: "" },
  },
  webZip: {
    id: "@pipelab/core/source/web-zip",
    label: "Web app ZIP",
    description: "A web app ZIP",
    icon: { type: "icon", icon: "mdi mdi-zip-box-outline" },
    output: { kind: "application", platform: "web", container: "archive", format: "zip" },
    fields: [
      { key: "path", label: "ZIP path", type: "file", required: true, fileExtensions: ["zip"] },
    ],
    defaultConfig: { path: "" },
  },
  construct: {
    id: "@pipelab/plugin-construct/source",
    label: "Construct project",
    description: "Construct .c3p",
    icon: { type: "icon", icon: "mdi mdi-cog-outline" },
    output: { kind: "application", platform: "web", container: "directory" },
    fields: [
      { key: "path", label: "Project file", type: "file", required: true, fileExtensions: ["c3p"] },
      { key: "profilePath", label: "Browser profile", type: "select", deferUntilEditor: true },
    ],
    defaultConfig: { path: "", profilePath: "" },
  },
  godot: {
    id: "@pipelab/plugin-godot/source",
    label: "Godot project",
    description: "Godot project",
    icon: { type: "icon", icon: "mdi mdi-robot-happy-outline" },
    output: { kind: "project", technology: "godot", container: "directory" },
    fields: [{ key: "path", label: "Project path", type: "directory", required: true }],
    defaultConfig: { path: "" },
  },
};

const catalog = {
  buildTypes: [],
  sources: [
    sourceFixtures.folder,
    sourceFixtures.webFolder,
    sourceFixtures.zip,
    sourceFixtures.webZip,
    sourceFixtures.construct,
    sourceFixtures.godot,
  ],
  producers: [],
  destinations: [
    {
      id: "@pipelab/plugin-steam/destination",
      label: "Steam",
      description: "Publish through Steam",
      icon: { type: "icon", icon: "mdi-steam" },
      accepts: {},
      fields: [
        {
          key: "accountConnectionId",
          label: "Steam account",
          type: "connection",
          integration: "@pipelab/plugin-steam",
          required: true,
        },
        { key: "appId", label: "Steam App ID", type: "text", required: true },
      ],
      slotFields: [{ key: "depotId", label: "Depot ID", type: "text", required: true }],
      defaultConfig: { accountConnectionId: "", appId: "" },
    },
    {
      id: "@pipelab/plugin-itch/destination",
      label: "Itch.io",
      description: "PC, web and more on itch.io",
      icon: { type: "icon", icon: "mdi mdi-storefront-outline" },
      accepts: {},
      fields: [
        {
          key: "accountConnectionId",
          label: "Itch account",
          type: "connection",
          integration: "@pipelab/plugin-itch",
          required: true,
        },
        { key: "project", label: "Project", type: "text", required: true },
      ],
      slotFields: [{ key: "channel", label: "Channel", type: "text", required: true }],
      defaultConfig: { accountConnectionId: "", project: "" },
    },
    {
      id: "@pipelab/plugin-poki/destination",
      label: "Poki",
      description: "Publish an HTML5 game",
      icon: { type: "icon", icon: "pi-globe" },
      accepts: {},
      fields: [
        { key: "project", label: "Poki project", type: "text", required: true },
        { key: "name", label: "Version name", type: "text", required: true },
        { key: "notes", label: "Release notes", type: "text", required: true },
      ],
      defaultConfig: { project: "", name: "", notes: "" },
    },
    {
      id: "@pipelab/core/destination/folder",
      label: "File system",
      description: "Export to a local folder",
      icon: { type: "icon", icon: "mdi-folder-outline" },
      accepts: {},
      fields: [{ key: "outputDir", label: "Output folder", type: "directory", required: true }],
      defaultConfig: { outputDir: "" },
    },
  ],
};

async function journey(
  sourceKey,
  sourcePath,
  withSavedSteamAccount = false,
  readinessTiming = false,
) {
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
  const phaseRequests = { load: [], inspection: [], planning: [] };
  const phaseResponses = { load: [], inspection: [], planning: [] };
  const phaseRequestCounts = { inspection: 0, planning: 0 };
  const sourceInspectionConfigs = [];
  let saved;
  let firstSaved;
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
      const phase =
        request.channel === "workflow:load"
          ? "load"
          : request.channel === "release:source:inspect"
            ? "inspection"
            : request.channel === "release:plan"
              ? "planning"
              : undefined;
      if (phase) phaseRequests[phase].push(performance.now());
      if (phase === "inspection" || phase === "planning") phaseRequestCounts[phase] += 1;
      if (phase === "inspection") sourceInspectionConfigs.push(request.data.config);
      const phaseOrdinal =
        phase === "inspection" || phase === "planning" ? phaseRequestCounts[phase] : 0;
      let result = {};
      let holdResponse = false;
      let responseDelayMs = 0;
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
          result = {
            version: "1.0.0",
            connections: withSavedSteamAccount
              ? [
                  {
                    id: "steam-existing",
                    pluginName: "@pipelab/plugin-steam",
                    integrationName: "Steam Account",
                    name: "Saved Steam account",
                    createdAt: "2026-01-01",
                    isDefault: true,
                    username: "fixture-user",
                  },
                ]
              : [],
          };
          break;
        case "providers:metadata:get":
          result = {
            providers: [
              {
                id: "@pipelab/plugin-steam",
                name: "Steam",
                packageName: "@pipelab/plugin-steam",
                icon: { type: "icon", icon: "mdi-steam" },
                description: "Steam provider",
                isOfficial: true,
                integrations: [
                  {
                    name: "Steam Account",
                    fields: [{ key: "username", label: "Steam Username", type: "text" }],
                  },
                ],
              },
              {
                id: "@pipelab/plugin-itch",
                name: "Itch.io",
                packageName: "@pipelab/plugin-itch",
                icon: { type: "icon", icon: "pi-palette" },
                description: "Itch.io provider",
                isOfficial: true,
                integrations: [
                  {
                    name: "Itch Butler Account",
                    fields: [{ key: "apiKey", label: "API key", type: "password" }],
                  },
                ],
              },
              {
                id: "@pipelab/plugin-construct",
                name: "Construct",
                packageName: "@pipelab/plugin-construct",
                icon: { type: "icon", icon: "pi pi-clone" },
                description: "Construct provider",
                isOfficial: true,
                integrations: [],
              },
              {
                id: "@pipelab/plugin-godot",
                name: "Godot",
                packageName: "@pipelab/plugin-godot",
                icon: { type: "icon", icon: "mdi mdi-gamepad-variant" },
                description: "Godot provider",
                isOfficial: true,
                integrations: [],
              },
            ],
          };
          break;
        case "release:catalog:get":
          result = catalog;
          break;
        case "release:source:inspect":
          result = {
            issues:
              readinessTiming && phaseOrdinal === 1
                ? [
                    {
                      code: "stale.source.inspect",
                      path: "path",
                      severity: "error",
                      message: "Stale source inspection response.",
                    },
                  ]
                : [],
            fieldOptions: {},
          };
          if (readinessTiming)
            responseDelayMs = phaseOrdinal === 1 ? 4000 : phaseOrdinal === 2 ? 1200 : 150;
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
              slots: destination.slots.flatMap((slot, index) => {
                const routedSlot = { ...slot, input: { source: true } };
                return destination.provider.includes("steam") && index === 0
                  ? [
                      routedSlot,
                      { ...routedSlot, id: `${slot.id}-second`, name: "Second deployment" },
                    ]
                  : [routedSlot];
              }),
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
              ...(readinessTiming && phaseOrdinal === 1
                ? [
                    {
                      code: "stale.plan",
                      path: "builds.0.config.mode",
                      severity: "error",
                      message: "Stale planner response.",
                    },
                  ]
                : []),
              {
                code: "steam.account.required",
                path: "destinations.0.config.accountConnectionId",
                severity: "error",
                message: "A Steam account connection is required.",
              },
              {
                code: "itch.account.required",
                path: "destinations.1.config.accountConnectionId",
                severity: "error",
                message: "An Itch account connection is required.",
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
          if (readinessTiming) responseDelayMs = phaseOrdinal === 1 ? 4000 : 150;
          break;
        case "fs:getHomeDirectory":
          result = { path: "/test-home" };
          break;
        case "dialog:showOpenDialog":
          result = { canceled: false, filePaths: ["/test-home/other.c3p"] };
          break;
        case "fs:getRoots":
          result = { roots: [{ name: "Home", path: "/test-home" }] };
          break;
        case "fs:listDirectory":
          result = {
            files: [
              { name: "demo.c3p", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
              { name: "other.c3p", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
              { name: "demo.zip", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
              { name: "notes.txt", isDirectory: false, isSymbolicLink: false, size: 1, mtime: 0 },
              {
                name: "Godot project",
                isDirectory: true,
                isSymbolicLink: false,
                size: 0,
                mtime: 0,
              },
              {
                name: "Web app folder",
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
          firstSaved ||= request.data.data;
          result = { success: true };
          break;
        case "workflow:load":
          result = saved;
          if (readinessTiming) responseDelayMs = 150;
          break;
      }
      if (!holdResponse) {
        const sendResponse = () => {
          if (phase)
            phaseResponses[phase].push({
              ordinal: phaseOrdinal || 1,
              at: performance.now(),
              requestedAt: phaseRequests[phase][(phaseOrdinal || 1) - 1],
            });
          socket.send(
            JSON.stringify({
              type: "response",
              requestId: request.requestId,
              events: { type: "end", data: { type: "success", result } },
            }),
          );
        };
        if (responseDelayMs) setTimeout(sendResponse, responseDelayMs);
        else sendResponse();
      }
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
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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
    await dialog.getByRole("heading", { name: "What are you releasing?" }).waitFor();
    await dialog
      .getByText(
        "Choose a source type for this release. You can select the project or files in Configuration.",
        { exact: true },
      )
      .waitFor();
    const sourceGrid = dialog.locator(".source-grid");
    assert.equal(
      await sourceGrid.getByRole("button").count(),
      6,
      "all six source choices are shown",
    );
    const sourceCardLabels = (await sourceGrid.getByRole("button").allTextContents()).map((text) =>
      text.replace(/\s+/g, " ").trim(),
    );
    for (const [index, label] of [
      "Folder",
      "Web app folder",
      "ZIP",
      "Web app ZIP",
      "Construct project",
      "Godot project",
    ].entries())
      assert.ok(sourceCardLabels[index].startsWith(label), `source card ${index + 1} is ${label}`);
    for (const sourceCard of await sourceGrid.getByRole("button").all())
      assert.ok(
        (await sourceCard.locator("img, i").count()) > 0,
        "each source choice includes its provider icon",
      );
    const desktopColumns = await sourceGrid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    );
    assert.equal(
      desktopColumns,
      narrow ? 2 : 3,
      "source cards use a three-column desktop grid and two-column narrow grid",
    );
    assert.equal(
      await dialog.evaluate(() => {
        const grid = document.querySelector(".source-grid");
        const name = document.querySelector("#release-name");
        return Boolean(
          grid && name && grid.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
      true,
      "Name follows source selection in the first setup step",
    );

    const firstStep = dialog.locator(".wizard-panel:visible");
    const sourceCard = sourceGrid.getByRole("button", {
      name: new RegExp(`^${sourceFixtures[sourceKey].label}\\b`),
    });
    await sourceCard.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await sourceCard.getAttribute("aria-pressed"),
      "true",
      `${sourceKey} can be selected with the keyboard`,
    );
    const expectedIcon =
      sourceKey === "construct"
        ? "pi-clone"
        : sourceKey === "godot"
          ? "mdi-gamepad-variant"
          : sourceFixtures[sourceKey].icon.icon.split(" ").at(-1);
    const renderedIcon = await sourceCard.locator("i").getAttribute("class");
    assert.ok(
      renderedIcon?.includes(expectedIcon),
      `${sourceKey} shows its provider icon (${expectedIcon}; rendered ${renderedIcon})`,
    );
    await dialog.getByLabel("Name", { exact: true }).fill(`${sourceKey} first workflow`);
    assert.equal(await firstStep.locator(".path-picker").count(), 0);
    assert.equal(await firstStep.locator("input[readonly]").count(), 0);
    assert.equal(
      await firstStep.getByRole("button", { name: /Choose .* (file|path)/i }).count(),
      0,
      "the first step does not ask for a local source path",
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

    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${sourceKey}-step1.png`),
      });
    // Path field constraints are exercised later, in Configuration after creation.
    const sourceField = sourceFixtures[sourceKey].fields[0];
    if (sourceFixtures[sourceKey].fields[0].type === "file") {
      assert.equal(sourceField.type, "file");
      assert.deepEqual(sourceField.fileExtensions, [sourceKey === "construct" ? "c3p" : "zip"]);
    } else {
      assert.equal(sourceField.type, "directory");
    }

    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("heading", { name: "Where do you want to ship?" }).waitFor();
    assert.equal(
      await dialog.locator(".destination-row").count(),
      4,
      "all four destination rows are visible",
    );
    await dialog.getByRole("button", { name: "Back" }).click();
    assert.equal(
      await sourceCard.getAttribute("aria-pressed"),
      "true",
      "Back preserves source selection",
    );
    assert.equal(
      await dialog.getByLabel("Name", { exact: true }).inputValue(),
      `${sourceKey} first workflow`,
    );
    await dialog.getByRole("button", { name: "Continue" }).click();
    const steam = dialog.getByRole("button", { name: /^Steam/ });
    const itch = dialog.getByRole("button", { name: /^Itch\.io/ });
    await steam.click();
    await itch.click();
    assert.equal(await steam.getAttribute("aria-pressed"), "true");
    assert.equal(await itch.getAttribute("aria-pressed"), "true");
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${sourceKey}-destinations.png`),
      });
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("heading", { name: "Review your choices" }).waitFor();
    const recap = dialog.locator(".wizard-panel:visible");
    await recap.getByText("Name", { exact: true }).waitFor();
    await recap.getByText(`${sourceKey} first workflow`, { exact: true }).waitFor();
    await recap.getByText(sourceFixtures[sourceKey].label, { exact: true }).waitFor();
    assert.equal(
      await recap.locator(".review-detail").count(),
      0,
      "recap does not imply a source path was selected",
    );
    await recap.getByText("Steam", { exact: true }).waitFor();
    await recap.getByText("Itch.io", { exact: true }).waitFor();
    assert.equal(
      await recap.locator(".review-destination").count(),
      2,
      "recap shows each selected destination separately",
    );
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
    await waitForRequests(page, calls, "release:source:inspect", 1);
    await waitForRequests(page, calls, "release:plan", 1);
    assert.equal(
      firstSaved.source.config.path || "",
      "",
      "creation keeps the selected source path empty",
    );
    assert.equal(
      sourceInspectionConfigs[0]?.path || "",
      "",
      "initial source inspection uses the empty default path",
    );
    if (!readinessTiming) await configureSourcePath(page, calls, sourceKey, sourcePath);
    if (readinessTiming) {
      await waitForRequests(page, calls, "release:source:inspect", 1);
      await waitForRequests(page, calls, "release:plan", 1);
      const inspectStart = phaseRequests.inspection[0];
      const planStart = phaseRequests.planning[0];
      assert.ok(
        Math.abs(inspectStart - planStart) < 100,
        `source inspection and planning start concurrently (${Math.round(Math.abs(inspectStart - planStart))}ms apart)`,
      );
      await page.getByText("Inspecting source…", { exact: true }).waitFor();
      await page.getByText("Planning release…", { exact: true }).waitFor();
      if (process.env.SCREENSHOT_DIR)
        await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, "readiness-pending.png") });
      assert.equal(await page.getByRole("button", { name: "Ship" }).isDisabled(), true);

      await page.locator(".source-card").getByRole("button", { name: "Edit" }).click();
      const sourceEditor = page.getByRole("dialog", { name: "Edit source" });
      await sourceEditor.getByRole("button", { name: /Choose project file/i }).click();
      const sourcePicker = page.getByRole("dialog").last();
      await sourcePicker.getByRole("row", { name: /other\.c3p/ }).click();
      await sourcePicker.getByRole("button", { name: "Open" }).click();
      await waitForRequests(page, calls, "release:source:inspect", 2);
      await waitForRequests(page, calls, "release:plan", 2);
      await page.getByText("Needs attention", { exact: true }).first().waitFor();
      await page.getByText("Inspecting source…", { exact: true }).waitFor();
      if (process.env.SCREENSHOT_DIR)
        await page.screenshot({
          path: join(process.env.SCREENSHOT_DIR, "readiness-blocked-pending.png"),
        });
      assert.equal(await page.getByText("Ready to ship", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Ship" }).isDisabled(), true);
      await sourceEditor.getByRole("button", { name: "Done" }).click();
      await page.waitForTimeout(3000);
      assert.equal(
        await page.getByText(/Stale (source inspection|planner) response\./).count(),
        0,
        "late results from the prior source revision are ignored",
      );
      assert.ok(
        phaseResponses.inspection.find((response) => response.ordinal === 2).at <
          phaseResponses.inspection.find((response) => response.ordinal === 1).at,
        `newer inspection response precedes stale one: ${JSON.stringify(phaseResponses.inspection)}`,
      );
      assert.ok(
        phaseResponses.planning.find((response) => response.ordinal === 2).at <
          phaseResponses.planning.find((response) => response.ordinal === 1).at,
        "the newer plan response is accepted before the stale older response arrives",
      );
      assert.ok(phaseResponses.load[0].at >= phaseRequests.load[0]);
      assert.equal(
        phaseRequestCounts.planning,
        2,
        "a source edit schedules one debounced replacement plan",
      );
    }
    await page.getByText("Action required", { exact: true }).waitFor();
    assert.equal((await page.locator(".workflow-readiness").innerText()).trim(), "Needs attention");
    assert.equal(
      await page.getByText("Ready to ship", { exact: true }).count(),
      0,
      "a plan blocker cannot show Ready to ship",
    );
    const actionCard = page.locator(".action-required-card");
    const screenshotKey = `${sourceKey}${withSavedSteamAccount ? "-saved-account" : ""}`;
    assert.equal((await actionCard.innerText()).match(/1 of 2/)?.[0], "1 of 2");
    assert.match(await actionCard.innerText(), /Connect your Steam account/);
    assert.match(await actionCard.innerText(), /A Steam account connection is required/);
    assert.equal(
      await actionCard.getByRole("button", { name: "Previous blocker" }).isDisabled(),
      true,
    );
    assert.equal(
      await actionCard.getByRole("button", { name: "Next blocker" }).isDisabled(),
      false,
    );
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${screenshotKey}-action-required.png`),
      });
    await page.waitForTimeout(250);
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${screenshotKey}-configuration.png`),
      });
    await actionCard.getByRole("button", { name: "Next blocker" }).click();
    assert.match(await actionCard.innerText(), /2 of 2/);
    assert.match(await actionCard.innerText(), /An Itch account connection is required/);
    await actionCard.getByRole("button", { name: "Previous blocker" }).click();
    assert.match(await actionCard.innerText(), /1 of 2/);
    let destinationEditor;
    if (withSavedSteamAccount) {
      await actionCard.getByRole("button", { name: "Select Steam connection" }).click();
      destinationEditor = page.getByRole("dialog", { name: "Edit destination" });
      await destinationEditor.waitFor();
      assert.equal(
        await page.getByRole("dialog", { name: "Add connection" }).count(),
        0,
        "a matching saved account opens the destination editor without the Add dialog",
      );
      const connectionField = destinationEditor.locator(".connection-field").first();
      await connectionField.getByRole("combobox").click();
      await page.getByRole("option", { name: "Saved Steam account" }).click();
      await page.waitForTimeout(1000);
      assert.equal(
        saved.destinations[0].config.accountConnectionId,
        "steam-existing",
        "Select CTA can set the existing matching account in the destination field",
      );
    } else {
      await actionCard.getByRole("button", { name: "Add Steam connection" }).click();
      destinationEditor = page.getByRole("dialog", { name: "Edit destination" });
      await destinationEditor.waitFor();
      await destinationEditor.locator(".connection-field").first().waitFor();
      await destinationEditor.getByText("Steam account", { exact: true }).waitFor();
      const connectionDialog = page.getByRole("dialog", { name: "Add connection" });
      await connectionDialog.getByLabel("Steam Username", { exact: true }).waitFor();
      await connectionDialog.getByRole("button", { name: "Cancel" }).click();
      await connectionDialog.waitFor({ state: "hidden" });
    }
    assert.equal(
      await page.getByText("Invalid output reference", { exact: true }).count(),
      0,
      "mock plan resolves the configured source output",
    );
    if (destinationEditor) {
      await destinationEditor.getByRole("button", { name: "Done" }).click();
      await destinationEditor.waitFor({ state: "hidden" });
    }
    const spacing = await page.locator(".job-card").evaluateAll((cards) => {
      const firstSlotList = cards[0]?.querySelector(".slot-list");
      return {
        cardCount: cards.length,
        siblingMargin: cards[1] ? getComputedStyle(cards[1]).marginTop : "0px",
        slotGap: firstSlotList ? getComputedStyle(firstSlotList).rowGap : "0px",
        slotInset: firstSlotList ? getComputedStyle(firstSlotList).paddingTop : "0px",
        slotCount: firstSlotList?.querySelectorAll(".slot-row").length || 0,
      };
    });
    assert.equal(spacing.cardCount, 2, "fixture shows two destination cards");
    assert.equal(spacing.siblingMargin, "10px", "destination cards keep a ten-pixel separation");
    assert.equal(spacing.slotGap, "8px", "deployment rows keep their eight-pixel gap");
    assert.equal(spacing.slotInset, "2px", "deployment rows have a small top inset");
    assert.equal(spacing.slotCount, 2, "fixture shows sibling deployment rows");
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.SCREENSHOT_DIR, `pipelab-${screenshotKey}-configuration.png`),
      });
    assert.ok(saved, "workflow save was called");
    assert.equal(saved.source.provider, sourceFixtures[sourceKey].id);
    assert.equal(saved.source.config.path, readinessTiming ? "/test-home/other.c3p" : sourcePath);
    assert.equal(
      saved.builds[0].id,
      "fixture-default-build",
      "resolved default build reaches workflow persistence",
    );
    assert.equal(saved.destinations.length, 2, "both selected destinations are persisted");
    assert.deepEqual(
      saved.destinations[0].slots[0].input,
      { source: true },
      "resolved output routing reaches workflow persistence",
    );
    assert.ok(calls.includes("workflow:save"));
    assert.ok(calls.includes("release:resolve-defaults"));
    assert.ok(calls.includes("release:plan"));
    assert.deepEqual(errors, [], `browser had no JS or console errors: ${errors.join("; ")}`);

    if (sourceKey === "construct" && !withSavedSteamAccount) {
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
      assert.equal(await lateDialog.locator(".path-picker").count(), 0);
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
    const readinessEvidence = readinessTiming
      ? `; readiness checks concurrent (${Math.round(Math.abs(phaseRequests.inspection[0] - phaseRequests.planning[0]))}ms start skew), durations (load ${Math.round(phaseResponses.load[0].at - phaseRequests.load[0])}ms; inspection ${Math.round(phaseResponses.inspection.find((response) => response.ordinal === 2).at - phaseResponses.inspection.find((response) => response.ordinal === 2).requestedAt)}ms; plan ${Math.round(phaseResponses.planning.find((response) => response.ordinal === 2).at - phaseResponses.planning.find((response) => response.ordinal === 2).requestedAt)}ms), stale replies ignored`
      : "";
    return `${sourceKey}: keyboard selection, picker, recap, default resolution, and Configuration repair passed${sourceKey === "construct" ? "; late resolver cancellation passed" : ""}${readinessEvidence}`;
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  const results = [];
  if (process.env.READINESS_ONLY === "1") {
    results.push(await journey("construct", "/test-home/demo.c3p", false, true));
  } else if (process.env.CONFIG_ONLY === "godot") {
    results.push(await journey("godot", "/test-home/Godot project"));
  } else if (process.env.CONFIG_ONLY === "construct") {
    results.push(await journey("construct", "/test-home/demo.c3p"));
  } else {
    results.push(await journey("folder", "/test-home/Godot project"));
    results.push(await journey("zip", "/test-home/demo.zip"));
    results.push(await journey("construct", "/test-home/demo.c3p"));
    results.push(await journey("construct", "/test-home/demo.c3p", false, true));
    results.push(await journey("construct", "/test-home/demo.c3p", true));
    results.push(await journey("godot", "/test-home/Godot project"));
  }
  for (const result of results) console.log(result);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
