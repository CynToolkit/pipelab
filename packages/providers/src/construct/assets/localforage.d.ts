// Ambient declaration for the `localforage` global that Construct 3's editor
// page exposes. This is used inside Playwright `page.evaluate()` callbacks
// which run in the browser context — not in Node.js — so no npm package is
// needed here. Only the methods actually used in script.ts are typed.
declare const localforage: {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
};
