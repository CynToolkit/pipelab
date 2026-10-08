export type OpenAsyncUrlResult = "opened" | "blocked" | "failed";

export const openAsyncUrl = async (getUrl: () => Promise<string | undefined>) => {
  let popup: Window | null = null;
  try {
    popup = window.open("about:blank", "_blank");
    if (!popup) return "blocked" as const;
    popup.opener = null;
    const url = await getUrl();
    if (!url) {
      popup.close();
      return "failed" as const;
    }
    popup.location.replace(url);
    return "opened" as const;
  } catch {
    popup?.close();
    return "failed" as const;
  }
};
