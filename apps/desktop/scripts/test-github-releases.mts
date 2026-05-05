import { fetchLatestDesktopRelease } from "../../../packages/core-node/src/utils/github";

async function test() {
  console.log("--- Testing Release Fetcher (Stable) ---");
  const stable = await fetchLatestDesktopRelease({ allowPrerelease: false });
  console.log("Result:", stable ? stable.tag_name : "None found");

  console.log("\n--- Testing Release Fetcher (Beta) ---");
  const beta = await fetchLatestDesktopRelease({ allowPrerelease: true });
  console.log("Result:", beta ? beta.tag_name : "None found");
}

test().catch(console.error);
