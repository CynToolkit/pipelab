import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { runWorkflowTask } from "@pipelab/test-utils";
import type { ConstructWorkflowTaskServices } from "./src/construct/export-c3p.js";
import { constructExportWorkflowTaskFactory } from "./src/construct/export-c3p.js";

const username = process.env.CONSTRUCT_USERNAME;
const password = process.env.CONSTRUCT_PASSWORD;
if (!username || !password) throw new Error("Required Construct credentials are missing.");

const appDataPath = join(homedir(), ".config", "@pipelab", "app-dev");
const benchmarkProjectId = "construct-benchmark-project";
const context = {
  releaseTag: "dev",
  getPackagesPath: (...segments: string[]) => join(appDataPath, "packages", ...segments),
  getThirdPartyPath: (...segments: string[]) => join(appDataPath, "thirdparty", ...segments),
  getCachePath: (folder = "pipelines", ...segments: string[]) =>
    join(appDataPath, "cache", folder, ...segments),
} as unknown as ConstructWorkflowTaskServices["context"];
const services: ConstructWorkflowTaskServices = {
  context,
  executables: { node: process.execPath, pnpm: "pnpm" },
  run: { projectId: benchmarkProjectId },
};
const artifacts = {
  zipFile: {
    descriptor: {
      kind: "files" as const,
      technology: "construct",
      container: "archive" as const,
      format: "zip" as const,
    },
  },
};

const fixture = resolve("packages/providers/src/construct/tests/e2e/fixtures/c3-export/test.c3p");
const workspacePath = await mkdtemp(join(tmpdir(), "pipelab-construct-benchmark-"));
const measureFullExport = process.env.CONSTRUCT_BENCHMARK_FULL_EXPORT === "true";
let setupMs: number | undefined;
let metricEmitted = false;
let workflowCompleted = false;
const stopAtNext = "construct-benchmark-stop-at-next";
const profileScope = (value: string) => createHash("sha256").update(value).digest("hex");
const unseededProfilePath = context.getCachePath(
  "pipelines",
  "construct",
  "profiles",
  profileScope([benchmarkProjectId, username.trim(), ""].join("\0")),
);
const customProfile =
  process.env.CONSTRUCT_PROFILE_PATH?.trim() ||
  (process.env.CONSTRUCT_BENCHMARK_SEED_FROM_CACHE === "true"
    ? join(unseededProfilePath, "Default")
    : "");
const profileIdentity = [
  benchmarkProjectId,
  username.trim(),
  customProfile ? resolve(customProfile) : "",
].join("\0");
const profilePath = context.getCachePath(
  "pipelines",
  "construct",
  "profiles",
  profileScope(profileIdentity),
);
const redact = (line: string) =>
  line.replaceAll(username, "[REDACTED]").replaceAll(password, "[REDACTED]");
const logger = {
  info(...args: unknown[]) {
    const line = args.map(String).join(" ");
    const match = /^Construct setup elapsed (\d+) ms$/.exec(line);
    if (match) {
      setupMs = Number(match[1]);
      console.log(`CONSTRUCT_SETUP_MS=${setupMs}`);
      metricEmitted = true;
    }
    if (
      /^(?:Playwright package resolved after|Construct browser binary ready after|Construct browser initialized after|Construct API authentication after|Construct document ready after|Construct auth reload ready after|Construct authentication setup after|Construct project picker ready after|Construct project file chooser opened after|Construct project file selected after|Construct recovery reload ready after|Construct project loading dialog appeared after|Construct project loading dialog dismissed after|Construct project opened after|Construct export menu selection after|Construct export platform selection after|Construct standard export options selection after|Construct Web export options selected after) \d+ ms$/.test(
        line,
      ) ||
      /^Construct managed profile ready after \d+ ms$/.test(line) ||
      /^Construct (?:menu button click|Project menu click|Export menu click|Web platform click|platform dialog ready|platform Next click|standard options dialog ready|offline option ready|final Next click) after \d+ ms$/.test(
        line,
      ) ||
      line === "Using Playwright Chromium channel chromium headless true" ||
      line.startsWith("Using Construct release saved with the project ") ||
      line === "Construct account session injected into the editor" ||
      line === "Reloading page to apply login state..." ||
      /^progress \d+(?:\.\d+)?%$/.test(line)
    ) {
      console.log(line);
    }
    if (
      line.startsWith("error, no result, crashed") ||
      line.startsWith("Construct file picker did not open; reloading once and retrying")
    ) {
      console.log(`CONSTRUCT_DIAGNOSTIC=${redact(line).slice(0, 500)}`);
    }
    if (line === '"Next" clicked' && !measureFullExport) throw new Error(stopAtNext);
  },
  warn(...args: unknown[]) {
    const line = args
      .map((value) => (value instanceof Error ? value.message : String(value)))
      .join(" ");
    console.log(`CONSTRUCT_WARNING=${redact(line).slice(0, 300)}`);
  },
  error(...args: unknown[]) {
    const line = args
      .map((value) => (value instanceof Error ? value.message : String(value)))
      .join(" ");
    console.log(`CONSTRUCT_ERROR=${redact(line).slice(0, 300)}`);
  },
};

try {
  try {
    const workflowStartedAt = Date.now();
    await runWorkflowTask(constructExportWorkflowTaskFactory(services), {
      workspacePath,
      inputs: {
        file: fixture,
        username,
        password,
        customProfile,
        headless: true,
        version: process.env.CONSTRUCT_VERSION,
      },
      artifacts,
      services,
      host: { logger },
    });
    workflowCompleted = true;
    if (measureFullExport) {
      console.log(`CONSTRUCT_FULL_EXPORT_MS=${Date.now() - workflowStartedAt}`);
    }
  } catch (error) {
    // Setup-only runs intentionally stop after Next; full runs continue to ZIP completion.
    if (measureFullExport || !(error instanceof Error) || error.message !== stopAtNext) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`CONSTRUCT_BENCHMARK_ERROR=${redact(message).slice(0, 500)}`);
    }
  }

  if (measureFullExport && !workflowCompleted) {
    console.log(
      setupMs === undefined
        ? "CONSTRUCT_BENCHMARK=FAILED_BEFORE_NEXT"
        : "CONSTRUCT_BENCHMARK=FAILED_AFTER_NEXT",
    );
    process.exitCode = 1;
  } else if (setupMs === undefined) {
    console.log("CONSTRUCT_BENCHMARK=FAILED_BEFORE_NEXT");
    process.exitCode = 1;
  } else if (!metricEmitted) {
    console.log(`CONSTRUCT_SETUP_MS=${setupMs}`);
  }
  const profileSize = await execa("du", ["-sB1", profilePath]).catch(() => undefined);
  const profileBytes = Number(profileSize?.stdout.split(/\s+/, 1)[0]);
  if (Number.isFinite(profileBytes) && profileBytes > 0) {
    console.log(`CONSTRUCT_PROFILE_DISK_BYTES=${profileBytes}`);
  }
} finally {
  await rm(workspacePath, { recursive: true, force: true });
}
