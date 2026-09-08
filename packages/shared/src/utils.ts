export const foo = "bar";

export type WithId<T> = T extends string | number ? never : T & { id: string };

export const transformUrl = (url: string | undefined | null): string => {
  if (url && typeof url === "string") {
    const getHost = (): string => {
      if (typeof window !== "undefined") {
        const isDev = process.env.NODE_ENV === "development";
        if (isDev) {
          return `http://${window.location.hostname}:33753`;
        } else {
          return `${window.location.protocol}//${window.location.host}`;
        }
      }
      return "http://localhost:33753";
    };

    const getAuthQuery = (): string => {
      if (typeof window === "undefined") return "";
      const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
      return token ? `?token=${encodeURIComponent(token)}` : "";
    };

    if (url.startsWith("file://")) {
      const filePath = decodeURIComponent(url.substring("file://".length));
      return `${getHost()}/media-file/${encodeURIComponent(filePath)}${getAuthQuery()}`;
    }
    if (url.startsWith("media://")) {
      const filePath = decodeURIComponent(url.replace(/^media:\/\/+/, "/"));
      return `${getHost()}/media-file/${encodeURIComponent(filePath)}${getAuthQuery()}`;
    }
  }
  return url || "";
};
