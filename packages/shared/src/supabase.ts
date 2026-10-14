import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";
import { resolveSupabasePublishableKey } from "./supabase-key";

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || "";
  const publishableKey = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });
  return { url, publishableKey };
};

export const isSupabaseAvailable = () => {
  const { url, publishableKey } = getSupabaseConfig();
  const available = !!(url && publishableKey);

  return available;
};

export const supabase = (options?: any) => {
  const { url, publishableKey } = getSupabaseConfig();
  if (!url || !publishableKey) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "Supabase environment variables are not configured. Supabase will not be available.",
      );
    }
    return null;
  }
  return createClient<Database>(url, publishableKey, options);
};
