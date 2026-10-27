import { spawnSync } from "node:child_process";

const names = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PIPELAB_CLOUD_LINK_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "PIPELAB_CLOUD_FROM_EMAIL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const secrets = Object.fromEntries(names.map((name) => [name, process.env[name]]));
secrets.SUPABASE_PUBLISHABLE_KEY ||= process.env.SUPABASE_ANON_KEY;
const missing = names.filter((name) => !secrets[name]);

if (missing.length) {
  const label = missing.includes("SUPABASE_PUBLISHABLE_KEY")
    ? missing.map((name) =>
        name === "SUPABASE_PUBLISHABLE_KEY"
          ? "SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY)"
          : name,
      )
    : missing;
  console.error(`Missing Doppler secrets: ${label.join(", ")}`);
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  ["exec", "wrangler", "secret", "bulk", "--config", "pipelab-cloud/wrangler.jsonc"],
  {
    input: JSON.stringify(secrets),
    stdio: ["pipe", "inherit", "inherit"],
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
