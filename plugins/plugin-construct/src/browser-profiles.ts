import { access, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join, normalize } from "node:path";
import { chromium } from "playwright";

export type BrowserProfileCandidate = {
  browser: string;
  profileName: string;
  path: string;
  isDefault: boolean;
  addonCount: number | null;
  lastUpdatedAt: number | null;
  score: number | null;
  usable: boolean;
  reason?: string;
};

const files = async (root: string): Promise<string[]> => {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return (await Promise.all(entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return files(path);
      return [path];
    }))).flat();
  } catch {
    return [];
  }
};

const newest = async (root: string) => {
  const paths = await files(root);
  let value = 0;
  for (const path of paths) {
    try { value = Math.max(value, (await stat(path)).mtimeMs); } catch { /* disappearing browser files */ }
  }
  return value || null;
};

const constructStorageUpdatedAt = async (profile: string) => {
  const root = join(profile, "IndexedDB");
  let value = 0;
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.name.includes("construct.net")) continue;
      value = Math.max(value, (await newest(join(root, entry.name))) || 0);
    }
  } catch { /* profile may be incomplete */ }
  return value || null;
};

const chromiumRoots = () => {
  const home = homedir();
  const config = process.env.XDG_CONFIG_HOME || join(home, ".config");
  if (platform() === "win32") {
    const local = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      ["Chrome", join(local, "Google", "Chrome", "User Data")],
      ["Edge", join(local, "Microsoft", "Edge", "User Data")],
      ["Chromium", join(local, "Chromium", "User Data")],
      ["Brave", join(local, "BraveSoftware", "Brave-Browser", "User Data")],
    ];
  }
  if (platform() === "darwin") {
    const app = join(home, "Library", "Application Support");
    return [
      ["Chrome", join(app, "Google", "Chrome")],
      ["Edge", join(app, "Microsoft Edge")],
      ["Chromium", join(app, "Chromium")],
      ["Brave", join(app, "BraveSoftware", "Brave-Browser")],
    ];
  }
  return [
    ["Chrome", join(config, "google-chrome")],
    ["Chrome Beta", join(config, "google-chrome-beta")],
    ["Chrome Dev", join(config, "google-chrome-unstable")],
    ["Edge", join(config, "microsoft-edge")],
    ["Chromium", join(config, "chromium")],
    ["Brave", join(config, "BraveSoftware", "Brave-Browser")],
    ["Vivaldi", join(config, "vivaldi")],
    ["Opera", join(config, "opera")],
  ];
};

const executable = (browser: string) => {
  const names = browser === "Chrome" ? ["google-chrome-stable", "chrome"] :
    browser === "Edge" ? ["microsoft-edge", "msedge"] :
      browser === "Chromium" ? ["chromium", "chromium-browser"] :
        browser === "Brave" ? ["brave-browser"] : browser === "Vivaldi" ? ["vivaldi"] : ["opera"];
  const dirs = (process.env.PATH || "").split(delimiter);
  return names.map((name) => dirs.map((dir) => join(dir, name)).find(existsSync)).find(Boolean);
};

type ChromiumProfile = { path: string; name: string };

export const chromiumProfiles = async (root: string): Promise<ChromiumProfile[]> => {
  try {
    const state = JSON.parse(await readFile(join(root, "Local State"), "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    const profiles = Object.entries(state.profile?.info_cache || {}).map(([path, info]) => ({ path, name: info.name || path }));
    if (profiles.length) {
      return (await Promise.all(profiles.map(async (profile) => {
        const nestedRoot = join(root, profile.path);
        if (!existsSync(join(nestedRoot, "Local State"))) return [profile];
        const nestedProfiles = await chromiumProfiles(nestedRoot);
        return nestedProfiles.map((nested) => ({ path: join(profile.path, nested.path), name: nested.name }));
      }))).flat();
    }
  } catch { /* older or damaged browser state */ }
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "Preferences")))
      .map((entry) => ({ path: entry.name, name: entry.name }));
  } catch { return []; }
};

export const inspectChromiumProfile = async (profile: string) => {
  const addonCount = await countChromiumAddons(profile, "Chrome");
  return { addonCount, lastUpdatedAt: await constructStorageUpdatedAt(profile), usable: addonCount !== null };
};

const countChromiumAddons = async (profile: string, browser: string) => {
  const browserPath = executable(browser);
  if (!browserPath) return null;
  const source = join(profile, "IndexedDB");
  try { await access(source); } catch { return 0; }
  const temp = await mkdtemp(join(process.env.TMPDIR || "/tmp", "pipelab-profile-"));
  try {
    const destination = join(temp, "Default", "IndexedDB");
    const { cp, mkdir } = await import("node:fs/promises");
    await mkdir(destination, { recursive: true });
    await cp(source, destination, { recursive: true });
    const context = await chromium.launchPersistentContext(temp, { executablePath: browserPath, headless: true });
    try {
      const page = await context.newPage();
      await page.goto("https://editor.construct.net/", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      return await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          const request = indexedDB.open("c3-addon-files");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        });
        if (!db) return 0;
        const store = db.objectStoreNames.contains("keyvaluepairs") ? "keyvaluepairs" : db.objectStoreNames[0];
        if (!store) return 0;
        return await new Promise<number>((resolve) => {
          const request = db.transaction(store).objectStore(store).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(0);
        });
      });
    } finally { await context.close(); }
  } catch { return null; } finally { await rm(temp, { recursive: true, force: true }).catch(() => {}); }
};

const discoverChromium = async () => {
  const found: BrowserProfileCandidate[] = [];
  for (const [browser, root] of chromiumRoots()) {
    for (const profile of await chromiumProfiles(root)) {
      const path = normalize(join(root, profile.path));
      if (!existsSync(join(path, "Preferences"))) continue;
      const addonCount = await countChromiumAddons(path, browser);
      found.push({ browser, profileName: profile.name, path, isDefault: profile.path.split(/[\\/]/).pop() === "Default", addonCount, lastUpdatedAt: await constructStorageUpdatedAt(path), score: null, usable: addonCount !== null, reason: addonCount === null ? "Browser unavailable or profile is locked" : undefined });
    }
  }
  return found;
};

const discoverFirefox = async () => {
  const root = platform() === "win32"
    ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Mozilla", "Firefox")
    : platform() === "darwin"
      ? join(homedir(), "Library", "Application Support", "Firefox")
      : join(homedir(), ".mozilla", "firefox");
  try {
    const ini = await readFile(join(root, "profiles.ini"), "utf8");
    return ini.split(/\n(?=\[Profile)/).flatMap((section) => {
      const path = section.match(/^Path=(.+)$/m)?.[1];
      if (!path) return [];
      const full = section.match(/^IsRelative=0$/m) ? path : join(root, path);
      const name = section.match(/^Name=(.+)$/m)?.[1] || full.split("/").pop() || "Firefox";
      return [{ browser: "Firefox", profileName: name, path: normalize(full), isDefault: /^Default=1$/m.test(section), addonCount: null, lastUpdatedAt: null, score: null, usable: false, reason: "Firefox profile discovery is read-only; Construct export uses Chromium" }];
    });
  } catch { return []; }
};

const discoverSafari = async (): Promise<BrowserProfileCandidate[]> => {
  if (platform() !== "darwin") return [];
  const root = join(homedir(), "Library", "Containers", "com.apple.Safari", "Data", "Library", "Safari", "Profiles");
  try {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => ({
      browser: "Safari", profileName: entry.name, path: join(root, entry.name), isDefault: false, addonCount: null, lastUpdatedAt: null, score: null, usable: false,
      reason: "Safari automation cannot access normal browsing storage",
    }));
  } catch { return []; }
};

export const discoverBrowserProfiles = async (): Promise<BrowserProfileCandidate[]> => {
  const candidates = [...await discoverChromium(), ...await discoverFirefox(), ...await discoverSafari()];
  const maxAddons = Math.max(0, ...candidates.map((candidate) => candidate.addonCount || 0));
  const now = Date.now();
  for (const candidate of candidates) {
    if (!candidate.usable) continue;
    const addonScore = maxAddons ? ((candidate.addonCount || 0) / maxAddons) * 60 : 0;
    const ageDays = candidate.lastUpdatedAt ? (now - candidate.lastUpdatedAt) / 86400000 : 180;
    candidate.score = Math.round(addonScore + Math.max(0, 1 - ageDays / 180) * 35 + (candidate.isDefault ? 5 : 0));
  }
  return candidates.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.addonCount ?? -1) - (a.addonCount ?? -1) || (b.lastUpdatedAt ?? 0) - (a.lastUpdatedAt ?? 0) || a.profileName.localeCompare(b.profileName));
};
