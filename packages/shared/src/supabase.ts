import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  return { url, anonKey };
};

export const isSupabaseAvailable = () => {
  const { url, anonKey } = getSupabaseConfig();
  const available = !!(url && anonKey);

  return available;
};

export const supabase = (options?: any) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Supabase environment variables are not configured. Supabase will not be available.");
    }
    return null;
  }
  return createClient<Database>(url, anonKey, options);
};
