import { expect, test } from "vitest";
import type { Page } from "playwright";
import { openConstructProjectFile } from "../../src/assets/script";

type FakeFileChooser = { setFiles: (files: string[]) => Promise<void> };

class FakePage {
  listeners = new Map<string, (value: unknown) => void>();
  bodyText = "Open";
  openVisible = true;
  reloadCount = 0;
  chooserFiles: string[] | undefined;
  screenshotPath: string | undefined;
  chooserOnOpen = false;
  chooserOnShortcut = false;
  closed = false;
  onOpenClick?: () => void;
  afterReload?: (page: FakePage) => void;
  triggerError?: Error;

  locator() {
    return {
      innerText: async () => this.bodyText,
    };
  }

  getByRole() {
    return this.openLocator();
  }

  getByText() {
    return this.openLocator();
  }

  private openLocator() {
    return {
      first: () => this.openLocator(),
      isVisible: async () => this.openVisible,
      isEnabled: async () => true,
      click: async () => {
        if (this.triggerError) throw this.triggerError;
        this.onOpenClick?.();
        if (this.chooserOnOpen) this.emitChooser();
      },
    };
  }

  keyboard = {
    press: async () => {
      if (this.triggerError) throw this.triggerError;
      if (this.chooserOnShortcut) this.emitChooser();
    },
  };

  waitForEvent(event: string, options: { timeout: number; signal: AbortSignal }) {
    expect(event).toBe("filechooser");
    // The production timeout is asserted while the mock advances it quickly.
    expect(options.timeout).toBe(5_000);
    return new Promise<FakeFileChooser>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        options.signal.removeEventListener("abort", onAbort);
        this.listeners.delete(event);
      };
      const listener = (value: unknown) => {
        cleanup();
        resolve(value as FakeFileChooser);
      };
      const onAbort = () => {
        cleanup();
        const error = options.signal.reason ?? new Error("Operation aborted");
        if (error instanceof Error && error.name === "Error") error.name = "AbortError";
        reject(error);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(Object.assign(new Error("chooser timeout"), { name: "TimeoutError" }));
      }, 1);
      this.listeners.set(event, listener);
      options.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private emitChooser() {
    const chooser = {
      setFiles: async (files: string[]) => {
        this.chooserFiles = files;
      },
    };
    this.listeners.get("filechooser")?.(chooser);
  }

  reload = async () => {
    this.reloadCount++;
    this.afterReload?.(this);
  };

  screenshot = async ({ path }: { path: string }) => {
    this.screenshotPath = path;
  };

  isClosed = () => this.closed;
}

const open = (page: FakePage, signal = new AbortController().signal) =>
  openConstructProjectFile(
    page as unknown as Page,
    "/projects/game.c3p",
    signal,
    () => {},
    "/diagnostics",
  );

test("arms the file chooser before clicking Construct's Open button", async () => {
  const page = new FakePage();
  page.chooserOnOpen = true;
  page.onOpenClick = () => expect(page.listeners.has("filechooser")).toBe(true);

  await open(page);

  expect(page.chooserFiles).toEqual(["/projects/game.c3p"]);
  expect(page.reloadCount).toBe(0);
});

test("falls back to Ctrl+O when the Open button does not produce a chooser", async () => {
  const page = new FakePage();
  page.chooserOnShortcut = true;

  await open(page);

  expect(page.chooserFiles).toEqual(["/projects/game.c3p"]);
});

test("reloads once and retries the chooser handshake", async () => {
  const page = new FakePage();
  page.afterReload = (reloadedPage) => {
    reloadedPage.chooserOnShortcut = true;
  };

  await open(page);

  expect(page.reloadCount).toBe(1);
  expect(page.chooserFiles).toEqual(["/projects/game.c3p"]);
});

test("captures a screenshot and reports a bounded failure after the retry", async () => {
  const page = new FakePage();

  await expect(open(page)).rejects.toThrow(
    /after one reload.*Screenshot: \/diagnostics\/construct-open-failure-/,
  );

  expect(page.reloadCount).toBe(1);
  expect(page.screenshotPath).toMatch(/^\/diagnostics\/construct-open-failure-\d+\.png$/);
});

test("honors cancellation while waiting for Construct readiness", async () => {
  const page = new FakePage();
  page.openVisible = false;
  const controller = new AbortController();
  const result = open(page, controller.signal);
  controller.abort(new Error("workflow cancelled"));

  await expect(result).rejects.toMatchObject({ name: "AbortError", message: "workflow cancelled" });
  expect(page.reloadCount).toBe(0);
});

test("honors cancellation while waiting for the file chooser", async () => {
  const page = new FakePage();
  const controller = new AbortController();
  const result = open(page, controller.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(new Error("workflow cancelled"));

  await expect(result).rejects.toMatchObject({ name: "AbortError", message: "workflow cancelled" });
  expect(page.reloadCount).toBe(0);
});

test("does not reload a closed page", async () => {
  const page = new FakePage();
  page.onOpenClick = () => {
    page.closed = true;
  };

  await expect(open(page)).rejects.toThrow(/file chooser|closed/i);
  expect(page.reloadCount).toBe(0);
  expect(page.screenshotPath).toBeUndefined();
});

test("passes renderer crashes through without retrying", async () => {
  const page = new FakePage();
  page.triggerError = new Error("Page crashed");

  await expect(open(page)).rejects.toThrow("Page crashed");
  expect(page.reloadCount).toBe(0);
});

test("retries a Construct startup error after one reload", async () => {
  const page = new FakePage();
  page.bodyText = "Oops! There was an error loading Construct";
  page.afterReload = (reloadedPage) => {
    reloadedPage.bodyText = "Open";
    reloadedPage.chooserOnOpen = true;
  };

  await open(page);

  expect(page.reloadCount).toBe(1);
  expect(page.chooserFiles).toEqual(["/projects/game.c3p"]);
});
