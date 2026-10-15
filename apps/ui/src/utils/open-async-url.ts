export type OpenAsyncUrlResult = "opened" | "blocked" | "failed";

const safeHttpUrl = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

export const openAsyncUrl = async (getUrl: () => Promise<string | undefined>) => {
  if (window.pipelab?.openExternal) {
    try {
      const destination = await getUrl();
      if (!destination) return "failed" as const;
      const url = safeHttpUrl(destination);
      if (!url) return "failed" as const;
      const result = await window.pipelab.openExternal(url);
      return result === false ? ("failed" as const) : ("opened" as const);
    } catch {
      return "failed" as const;
    }
  }

  let popup: Window | null = null;
  try {
    popup = window.open("about:blank", "_blank");
    if (!popup) return "blocked" as const;
    popup.opener = null;
    const destination = await getUrl();
    if (!destination) {
      popup.close();
      return "failed" as const;
    }
    const url = safeHttpUrl(destination);
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
