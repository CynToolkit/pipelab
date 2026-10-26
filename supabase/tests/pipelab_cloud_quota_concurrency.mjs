import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const userId = randomUUID();
const email = `cloud-quota-${userId}@example.test`;

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("supabase", ["db", "query", "--local", "--output-format", "json", sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function reservationSql(label) {
  return `select public.reserve_pipelab_cloud_artifact_upload(
    '${userId}', 'concurrency/${label}-${randomUUID()}', '${label}',
    'electron.windows', 'project-${label}', 'profile-${label}', 'windows-x64',
    '1.0.0', '${label}.zip', 'file', 60, '${"a".repeat(64)}', 100, 30
  )`;
}

const setup = await runQuery(
  `insert into auth.users (id, aud, role, email, encrypted_password)
   values ('${userId}', 'authenticated', 'authenticated', '${email}', '')`,
);
if (setup.exitCode !== 0) {
  throw new Error(`Could not create the local quota-concurrency test user: ${setup.stderr}`);
}

try {
  const results = await Promise.all([
    runQuery(reservationSql("first")),
    runQuery(reservationSql("second")),
  ]);
  const accepted = results.filter((result) => result.exitCode === 0);
  const rejected = results.filter((result) =>
    `${result.stdout}\n${result.stderr}`.includes("pipelab_cloud_quota_exceeded"),
  );

  if (accepted.length !== 1 || rejected.length !== 1) {
    throw new Error(
      `Expected one accepted and one quota-rejected concurrent upload reservation. Results: ${JSON.stringify(results)}`,
    );
  }

  console.log("Local quota concurrency check passed: one reservation accepted, one rejected.");
} finally {
  await runQuery(`delete from auth.users where id = '${userId}'`);
}
