export type SupabaseKeyEnvironment = {
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
};

/** Prefer the canonical client key while retaining a temporary legacy fallback. */
export function resolveSupabasePublishableKey(environment: SupabaseKeyEnvironment): string {
  return environment.SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY || "";
}
