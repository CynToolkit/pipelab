import { useAPI } from "@renderer/composables/api";
import { klona } from "klona";

export const loadInternalFile = (name: string) => {
  const api = useAPI();

  return api.execute("pipeline:load-by-name", {
    name,
  });
};

export const saveInternalFile = (name: string, data: unknown) => {
  const api = useAPI();

  return api.execute("pipeline:save-by-name", {
    name,
    data: JSON.stringify(klona(data)),
  });
};

/** @deprecated External pipeline files are deprecated. Use pipeline:load instead. */
export const loadExternalFile = (path: string) => {
  const api = useAPI();

  return api.execute("pipeline:load-by-path", {
    path,
  });
};

/** @deprecated External pipeline files are deprecated. Use pipeline:save instead. */
export const saveExternalFile = (path: string, data: unknown) => {
  const api = useAPI();

  return api.execute("pipeline:save-by-path", {
    path,
    data: JSON.stringify(klona(data)),
  });
};
