import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadThirdPartyScripts } from "./third-party-scripts";

describe("third-party script loading", () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it.each(["/auth/auth-success", "/auth/auth-success/", "/AUTH/auth-success"])(
    "does not load third-party scripts on token-bearing verification route %s",
    (pathname) => {
      loadThirdPartyScripts(pathname);

      expect(document.querySelectorAll("script")).toHaveLength(0);
    },
  );

  it("loads analytics and the Tally widget on ordinary routes", () => {
    loadThirdPartyScripts("/");

    expect(document.head.querySelector("script")?.src).toBe(
      "https://cloud.umami.is/script.js",
    );
    expect(document.body.querySelector("script")?.src).toBe(
      "https://tally.so/widgets/embed.js",
    );
  });
});
