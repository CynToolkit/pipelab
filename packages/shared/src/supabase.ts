import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

const supabaseUrl = (globalThis as any).__SUPABASE_URL__ || process.env.SUPABASE_URL || "";
const supabaseAnonKey = (globalThis as any).__SUPABASE_ANON_KEY__ || process.env.SUPABASE_ANON_KEY || "";

let _isSupabaseAvailable = true;
// ensure supabase env variables are available at build time
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are not configured.");
  _isSupabaseAvailable = false;
}

export const supabase = (options?: any) =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, options);
export const isSupabaseAvailable = _isSupabaseAvailable;
