import { test, expect } from "@playwright/test";

test("example workflow follows creation steps without saving or publishing", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://localhost:5173") && !request.url().startsWith("data:"))
      requests.push(request.url());
  });
  await page.goto("/");
  const wizard = page.getByLabel("Try an example release workflow");
  await expect(
    page.getByRole("heading", { name: "A simple way to ship your game." }),
  ).toBeVisible();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await expect(wizard.getByRole("button", { name: /Project source/ })).toBeDisabled();
  await wizard.getByLabel("Name *").fill("My game");
  await wizard.getByLabel("Description (optional)").fill("First release");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await wizard.getByRole("button", { name: /Construct project/ }).click();
  await expect(wizard.getByLabel(/Example project.*path/)).toHaveCount(0);
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await expect(wizard.locator(".choice-row.stores svg")).toHaveCount(2);
  await wizard.getByRole("button", { name: "Steam" }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByText("My game")).toBeVisible();
  await expect(wizard.getByText("First release")).toBeVisible();
  await expect(wizard.getByText("Steam", { exact: true })).toBeVisible();
  await expect(wizard.getByText("Electron desktop · Windows x64")).toBeVisible();
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: /Folder Game files/ }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: "Steam" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByText("Desktop build needed")).toBeVisible();
  await wizard.getByRole("button", { name: "Create example workflow" }).click();
  await expect(wizard.getByText("Nothing was saved, built or uploaded.")).toBeVisible();
  await expect(wizard.getByRole("heading", { name: "Example project dashboard" })).toBeFocused();
  await expect(wizard.getByText("Release workflow · needs setup")).toBeVisible();
  await wizard.getByRole("button", { name: "Start again" }).click();
  await expect(wizard.getByLabel("Name *")).toBeEmpty();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await wizard.getByLabel("Name *").fill("Web game");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await wizard.getByRole("button", { name: /Construct project/ }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await wizard.getByRole("button", { name: "itch.io" }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByText("Construct web export")).toBeVisible();
  await expect(wizard.getByText("Electron desktop · Windows x64")).toHaveCount(0);
  expect(requests.filter((url) => /release:|workflow:|api\.pipelab/.test(url))).toEqual([]);
});

test("landing page remains usable at mobile, tablet, and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", {
        name: "Four steps. From project to players.",
      }),
    ).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Build for desktop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Send it to a store" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find the output" })).toBeVisible();
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
