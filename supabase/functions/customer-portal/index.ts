import { createBillingHandler, createSupabaseUserResolver } from "../_shared/billing.ts";

const env = (name: string) => Deno.env.get(name);
Deno.serve(
  createBillingHandler("customer-portal", {
    env,
    fetcher: fetch,
    resolveUser: createSupabaseUserResolver(env, fetch),
  }),
);
