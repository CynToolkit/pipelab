export const foo = "bar";

export type WithId<T> = T extends string | number ? never : T & { id: string };

export const transformUrl = (url: string | undefined | null): string => {
  if (url && typeof url === "string") {
    const getHost = (): string => {
      if (typeof window !== "undefined") {
        const isDev = window.location.port === "5173";
        if (isDev) {
          return `http://${window.location.hostname}:33753`;
        } else {
          return `${window.location.protocol}//${window.location.host}`;
        }
      }
      return "http://localhost:33753";
    };

    if (url.startsWith("file://")) {
      const filePath = url.substring("file://".length);
      return `${getHost()}/media-file/${encodeURIComponent(filePath)}`;
    }
    if (url.startsWith("media://")) {
      const filePath = url.replace(/^media:\/\/+/, "/");
      return `${getHost()}/media-file/${encodeURIComponent(filePath)}`;
    }
  }
  return url || "";
};
