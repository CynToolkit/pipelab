import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";

export const preserveDesktopCliPort = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): RouteLocationRaw | undefined => {
  const cliPort = from.query.cliPort;
  if (to.query.cliPort != null || typeof cliPort !== "string") return;

  return {
    ...to,
    query: { ...to.query, cliPort },
  };
};
