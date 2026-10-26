import { supabase } from "@pipelab/shared";
import type { PipelabContext } from "./context";
import { readDesktopBootstrapEnvironment } from "./desktop-bootstrap";
import { SecureCloudAuthStorage } from "./utils/secure-cloud-auth-storage";
import { JsonFileStorage } from "./utils/storage";

export const createPipelabCloudAuthClient = (context: PipelabContext) => {
  const storage = readDesktopBootstrapEnvironment()
    ? new JsonFileStorage("auth-session.json", context)
    : new SecureCloudAuthStorage(context);
  return supabase({
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
};
