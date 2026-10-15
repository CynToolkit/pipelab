import { describe, expect, it } from "vitest";
import {
  browserPreferences,
  readBrowserPreferences,
  saveBrowserPreference,
} from "./browser-preferences";

const storage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe("browser preferences", () => {
  it("loads only supported theme and locale values", () => {
    expect(
      readBrowserPreferences(storage({ "pipelab.theme": "dark", "pipelab.locale": "fr-FR" })),
    ).toEqual({ theme: "dark", locale: "fr-FR" });
    expect(
      readBrowserPreferences(storage({ "pipelab.theme": "sepia", "pipelab.locale": "unknown" })),
    ).toEqual({ theme: "light", locale: "en-US" });
  });

  it("applies a browser preference only after its storage write succeeds", () => {
    const writes = storage();
    const initialTheme = browserPreferences.theme;
    expect(saveBrowserPreference("theme", "dark", writes)).toBe(true);
    expect(browserPreferences.theme).toBe("dark");
    expect(writes.getItem("pipelab.theme")).toBe("dark");

    const failingStorage = {
      setItem: () => {
        throw new Error("storage is unavailable");
      },
    };
    expect(saveBrowserPreference("theme", initialTheme, failingStorage)).toBe(false);
    expect(browserPreferences.theme).toBe("dark");
  });
});
