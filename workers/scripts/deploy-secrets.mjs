import { spawnSync } from "node:child_process";

const names = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const secrets = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const missing = names.filter((name) => !secrets[name]);

if (missing.length) {
  console.error(`Missing Doppler secrets: ${missing.join(", ")}`);
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
