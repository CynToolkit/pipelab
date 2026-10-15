import { test, expect } from "@playwright/test";

test("example workflow follows creation steps without saving or publishing", async ({
  page,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required");
  const appOrigin = new URL(baseURL).origin;
  const unexpectedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method();
    const isLocalPageAsset =
      url.origin === appOrigin &&
      ["document", "script", "stylesheet", "image", "font"].includes(request.resourceType()) &&
      ["GET", "HEAD"].includes(method);
    const isSiteAnalyticsScript =
      url.href === "https://cloud.umami.is/script.js" &&
      method === "GET" &&
      request.resourceType() === "script";
    const isSiteAnalyticsEvent =
      url.origin === "https://gateway.umami.is" &&
      url.pathname === "/api/send" &&
      method === "POST";
    const isSiteFontStylesheet =
      url.origin === "https://fonts.googleapis.com" &&
      url.pathname === "/css2" &&
      method === "GET" &&
      request.resourceType() === "stylesheet";
    const isSiteFont =
      url.origin === "https://fonts.gstatic.com" &&
      url.pathname.startsWith("/s/publicsans/") &&
      method === "GET" &&
      request.resourceType() === "font";
    const isFeedbackWidget =
      url.href === "https://tally.so/widgets/embed.js" &&
      method === "GET" &&
      request.resourceType() === "script";
    if (
      !isLocalPageAsset &&
      !isSiteAnalyticsScript &&
      !isSiteAnalyticsEvent &&
      !isSiteFontStylesheet &&
      !isSiteFont &&
      !isFeedbackWidget
    ) {
      unexpectedRequests.push(`${method} ${url.href}`);
    }
  });
  await page.goto("/");
  const wizard = page.getByLabel("Try an example game workflow");
  await expect(
    page.getByRole("heading", { name: "A simple way to ship your game." }),
  ).toBeVisible();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await expect(wizard.getByRole("button", { name: /Project source/ })).toBeDisabled();
  await expect(wizard.getByRole("button", { name: "Recap" })).toBeDisabled();
  await wizard.getByLabel("Name *").fill("My game");
  await wizard.getByLabel("Description (optional)").fill("Arcade platformer");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await expect(wizard.getByRole("button", { name: "Destinations" })).toBeDisabled();
  await expect(wizard.locator('input[type="file"]')).toHaveCount(0);
  await wizard.getByRole("button", { name: /Construct project/ }).click();
  const sourcePath = wizard.locator("#example-source-path");
  await expect(sourcePath).toHaveAttribute("type", "text");
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await sourcePath.fill("   ");
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await sourcePath.fill("Games/MyGame/MyGame.c3p");
  await wizard.getByRole("button", { name: "Back" }).click();
  await expect(wizard.getByLabel("Name *")).toHaveValue("My game");
  await expect(wizard.getByLabel("Description (optional)")).toHaveValue("Arcade platformer");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(sourcePath).toHaveValue("Games/MyGame/MyGame.c3p");
  await wizard.getByRole("button", { name: /Folder Game files/ }).click();
  await expect(sourcePath).toBeEmpty();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await sourcePath.fill("Games/MyGame/");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await expect(wizard.locator(".choice-row.stores svg")).toHaveCount(2);
  await wizard.getByRole("button", { name: "Steam" }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByText("My game")).toBeVisible();
  await expect(wizard.getByText("Arcade platformer")).toBeVisible();
  await expect(wizard.getByText("Games/MyGame/", { exact: true })).toBeVisible();
  await expect(wizard.getByText("Steam", { exact: true })).toBeVisible();
  await expect(wizard.locator(".recap dt")).toHaveText([
    "Name",
    "Description",
    "Project",
    "Project path",
    "Stores",
  ]);
  await expect(
    wizard.locator(".recap").getByText(/Build match|Electron|Tauri|Windows/),
  ).toHaveCount(0);
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: "Back" }).click();
  await expect(sourcePath).toHaveValue("Games/MyGame/");
  await wizard.getByRole("button", { name: /Folder Game files/ }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: "Steam" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.locator(".recap dt")).toHaveText([
    "Name",
    "Description",
    "Project",
    "Project path",
    "Stores",
  ]);
  await wizard.getByRole("button", { name: "Create example workflow" }).click();
  await expect(wizard.getByText(/nothing was saved, built or uploaded/i)).toBeVisible();
  await expect(
    wizard.getByText(/configure builds and connect store accounts after creating a workflow/i),
  ).toBeVisible();
  await expect(wizard.getByRole("heading", { name: "Dashboard preview" })).toBeFocused();
  await expect(wizard.locator(".dashboard-workflows li")).toHaveCount(3);
  await expect(wizard.locator(".dashboard-actions")).toHaveCount(3);
  await expect(wizard.getByRole("button").filter({ hasText: /^(Edit|Run)$/ })).toHaveCount(0);
  await wizard.getByRole("button", { name: "Start again" }).click();
  await expect(wizard.getByLabel("Name *")).toBeEmpty();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await wizard.getByLabel("Name *").fill("Web game");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await wizard.getByRole("button", { name: /Construct project/ }).click();
  const restartedPath = wizard.locator("#example-source-path");
  await expect(restartedPath).toBeEmpty();
  await restartedPath.fill("Games/WebGame/WebGame.c3p");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await wizard.getByRole("button", { name: "itch.io" }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: "Back" }).click();
  await expect(wizard.getByLabel("Name *")).toHaveValue("Web game");
  await wizard.getByLabel("Name *").fill("Moonlit Arcade");
  await wizard.getByRole("button", { name: "Recap" }).click();
  await expect(wizard.getByText("Games/WebGame/WebGame.c3p", { exact: true })).toBeVisible();
  await wizard.getByRole("button", { name: "Create example workflow" }).click();
  await expect(wizard.locator(".dashboard-workflows li")).toHaveCount(3);
  await expect(
    wizard.locator(".dashboard-project strong").filter({ hasText: "Moonlit Arcade" }),
  ).toHaveCount(2);
  expect(unexpectedRequests).toEqual([]);
});

test("landing page remains usable at mobile, tablet, and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "From project to players." })).toBeVisible();
    for (const step of ["Choose game", "Build", "Choose stores", "Publish"]) {
      await expect(page.getByRole("heading", { name: step, exact: true })).toBeVisible();
    }
    await expect(page.getByText("View runs", { exact: true })).toBeVisible();
    await expect(page.getByText("Game files", { exact: true })).toBeVisible();
    await expect(page.locator(".window-dots")).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
    await expect(page.getByRole("link", { name: "Download Pipelab" }).first()).toHaveAttribute(
      "href",
      "/download",
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".wizard-panel")).toHaveCSS("animation-name", "none");
});

test("restored content and navigation lead to the current Construct guide", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ready to share your game?" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Docs" }),
  ).toHaveAttribute("href", "https://docs.pipelab.app");
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "GitHub" }),
  ).toHaveAttribute("href", "https://github.com/CynToolkit/pipelab");
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "How it works" }),
  ).toHaveAttribute("href", "/#how-it-works");
  await page.getByRole("link", { name: /Using Construct 3/ }).click();
  await expect(page).toHaveURL(/\/construct3$/);
  await expect(
    page.getByRole("heading", {
      name: "Take your Construct project into a release workflow.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Both paths are required.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the Construct guide" })).toHaveAttribute(
    "href",
    "https://docs.pipelab.app/guide/integrations/construct",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const label of ["Docs", "GitHub", "Contact", "Discord"]) {
    await expect(mobileNav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(mobileNav.getByRole("link", { name: "Contact" })).toHaveAttribute(
    "href",
    "mailto:contact@pipelab.app",
  );
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(mobileNav).toBeHidden();
  await page.setViewportSize({ width: 700, height: 300 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await mobileNav.getByRole("link", { name: "Discord" }).focus();
  await expect(mobileNav.getByRole("link", { name: "Discord" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(mobileNav).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});
