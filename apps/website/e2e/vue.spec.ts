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
  await expect(wizard.getByRole("button", { name: /Source & project path/ })).toBeDisabled();
  await wizard.getByLabel("Name *").fill("My game");
  await wizard.getByLabel("Description (optional)").fill("First release");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await wizard.getByRole("button", { name: /Construct project/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await wizard.getByLabel("Example project file path *").fill("/Games/MyGame.c3p");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await wizard.getByRole("button", { name: "Steam" }).click();
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByText("My game")).toBeVisible();
  await expect(wizard.getByText("First release")).toBeVisible();
  await expect(wizard.getByText("/Games/MyGame.c3p")).toBeVisible();
  await expect(wizard.getByText("Steam", { exact: true })).toBeVisible();
  await expect(wizard.getByText(/Windows|Electron|Tauri/)).toHaveCount(0);
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: "Back" }).click();
  await expect(wizard.getByLabel("Example project file path *")).toHaveValue("/Games/MyGame.c3p");
  await wizard.getByRole("button", { name: /Folder Game files/ }).click();
  await expect(wizard.getByLabel("Example project path *")).toBeEmpty();
  await wizard.getByLabel("Example project path *").fill("/Games/Folder");
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await expect(wizard.getByRole("button", { name: "Steam" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await wizard.getByRole("button", { name: /Continue/ }).click();
  await wizard.getByRole("button", { name: "Create example workflow" }).click();
  await expect(wizard.getByText("Nothing was saved, built or uploaded.")).toBeVisible();
  await expect(wizard.getByRole("heading", { name: "Example workflow created" })).toBeFocused();
  await wizard.getByRole("button", { name: "Start again" }).click();
  await expect(wizard.getByLabel("Name *")).toBeEmpty();
  await expect(wizard.getByRole("button", { name: /Continue/ })).toBeDisabled();
  expect(requests.filter((url) => /release:|workflow:|api\.pipelab/.test(url))).toEqual([]);
});

test("landing page remains usable at mobile, tablet, and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [390, 768, 1440]) {
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
