import { afterEach, describe, expect, it, vi } from "vitest";
import { openAsyncUrl } from "./open-async-url";

describe("openAsyncUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens a user-initiated window before awaiting the destination", async () => {
    let resolveUrl: (url: string) => void = () => {};
    const replace = vi.fn();
    const close = vi.fn();
    const open = vi.fn().mockReturnValue(undefined);
    const popup = { opener: {}, close, location: { replace } } as unknown as Window;
    open.mockReturnValue(popup);
    vi.stubGlobal("window", { open });

    const result = openAsyncUrl(() => new Promise((resolve) => (resolveUrl = resolve)));

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    resolveUrl("https://billing.example/portal");

    await expect(result).resolves.toBe("opened");
    expect(replace).toHaveBeenCalledWith("https://billing.example/portal");
    expect(close).not.toHaveBeenCalled();
  });

  it("reports blocked popups and closes a blank tab after a failed request", async () => {
    const open = vi.fn().mockReturnValue(null);
    vi.stubGlobal("window", { open });
    await expect(openAsyncUrl(async () => "https://billing.example/portal")).resolves.toBe(
      "blocked",
    );

    const close = vi.fn();
    open.mockReturnValue({
      opener: {},
      close,
      location: { replace: vi.fn() },
    } as unknown as Window);
    await expect(openAsyncUrl(async () => undefined)).resolves.toBe("failed");
    expect(close).toHaveBeenCalledOnce();
  });
});
