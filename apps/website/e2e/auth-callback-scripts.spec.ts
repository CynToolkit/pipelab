import { expect, test } from "@playwright/test";

test("does not load third-party scripts on the token-bearing verification route", async ({
  page,
}) => {
  const thirdPartyRequests: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname === "cloud.umami.is" || hostname === "tally.so") {
      thirdPartyRequests.push(request.url());
    }
  });

  await page.goto("/auth/auth-success#access_token=test-access&refresh_token=test-refresh", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.location.hash === "");
  await page.waitForTimeout(300);

  await expect(page).toHaveURL(/\/auth\/auth-success$/);
  expect(thirdPartyRequests).toEqual([]);
});
