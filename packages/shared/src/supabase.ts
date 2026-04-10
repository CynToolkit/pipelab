import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  return { url, anonKey };
};

export const supabase = (options?: any) => {
  const { url, anonKey } = getSupabaseConfig();
  return createClient<Database>(url, anonKey, options);
};

export const isSupabaseAvailable = () => {
  const { url, anonKey } = getSupabaseConfig();
  const available = !!(url && anonKey);

  if (!available) {
    console.warn("Supabase environment variables are not configured.", {
      hasUrl: !!url,
      hasKey: !!anonKey,
    });
  }

  return available;
};
