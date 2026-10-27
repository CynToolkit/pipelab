import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const secretNames = ["POLAR_TOKEN", "POLAR_ORGANIZATION_ID", "POLAR_ALLOWED_ORIGINS"];
const functions = ["polar-available-plans", "polar-user-plan", "customer-portal", "checkout"];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in the environment.`);
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} cannot contain control characters.`);
  }
  return value;
}

function validateOrigins(value) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.length) throw new Error("POLAR_ALLOWED_ORIGINS must contain an HTTPS origin.");

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("POLAR_ALLOWED_ORIGINS must contain exact HTTPS origins.");
    }

    if (
      parsed.protocol !== "https:" ||
      origin.includes("*") ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        "POLAR_ALLOWED_ORIGINS must contain exact HTTPS origins without paths or wildcards.",
      );
    }
  }
}

function quoteEnvValue(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function runSupabase(args, operation) {
  const result = spawnSync("supabase", args, { stdio: "inherit" });
  if (result.error) throw new Error(`${operation} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${operation} failed with exit status ${result.status ?? "unknown"}.`);
  }
}

async function main() {
  const projectRef = requiredEnv("SUPABASE_PROJECT_REF");
  requiredEnv("SUPABASE_ACCESS_TOKEN");
  if (process.env.PIPELAB_BILLING_DEPLOY_APPROVED !== "true") {
    throw new Error(
      "Set PIPELAB_BILLING_DEPLOY_APPROVED=true only after approving this exact nonproduction project.",
    );
  }

  const secrets = Object.fromEntries(secretNames.map((name) => [name, requiredEnv(name)]));
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      secrets.POLAR_ORGANIZATION_ID,
    )
  ) {
    throw new Error("POLAR_ORGANIZATION_ID must be a UUID.");
  }
  validateOrigins(secrets.POLAR_ALLOWED_ORIGINS);

  const tempDirectory = await mkdtemp(join(tmpdir(), "pipelab-browser-billing-"));
  const envFile = join(tempDirectory, "billing.env");

  try {
    await chmod(tempDirectory, 0o700);
    const contents = secretNames
      .map((name) => `${name}=${quoteEnvValue(secrets[name])}`)
      .join("\n");
    await writeFile(envFile, `${contents}\n`, { mode: 0o600 });

    runSupabase(
      ["secrets", "set", "--env-file", envFile, "--project-ref", projectRef],
      "Setting browser billing secrets",
    );
    runSupabase(
      ["functions", "deploy", ...functions, "--project-ref", projectRef, "--use-api"],
      "Deploying browser billing functions",
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  process.stdout.write(`Deployed browser billing functions to Supabase project ${projectRef}.\n`);
}

main().catch((error) => {
  process.stderr.write(`Browser billing deployment failed: ${error.message}\n`);
  process.exitCode = 1;
});
