import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { execa } from "execa";
import StreamZip from "node-stream-zip";
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
const managedProfileExistedBefore = existsSync(profilePath);
const redact = (line: string) =>
  line.replaceAll(username, "[REDACTED]").replaceAll(password, "[REDACTED]");
const readCpuPressureAvg10 = async (): Promise<string | undefined> => {
  if (process.platform !== "linux") return undefined;
  try {
    const lines = (await readFile("/proc/pressure/cpu", "utf8")).split(/\r?\n/);
    const somePressure = lines.find((line) => line.startsWith("some "));
    return somePressure?.match(/(?:^|\s)avg10=([\d.]+)/)?.[1];
  } catch {
    return undefined;
  }
};
const logCpuPressure = (phase: "BEFORE" | "AFTER", avg10: string | undefined): void => {
  if (process.platform !== "linux") return;
  console.log(`CONSTRUCT_CPU_PRESSURE_SOME_AVG10_${phase}=${avg10 ?? "unavailable"}`);
};
const verifyRegisteredZip = async (zipPath: string) => {
  const zipStat = await stat(zipPath).catch(() => undefined);
  if (!zipStat?.isFile() || zipStat.size <= 0) {
    throw new Error("Registered Construct ZIP is missing or empty");
  }

  let archive: InstanceType<typeof StreamZip.async>;
  try {
    archive = new StreamZip.async({ file: zipPath });
  } catch {
    throw new Error("Registered Construct ZIP is unreadable");
  }

  try {
    let indexEntry: Awaited<ReturnType<typeof archive.entry>>;
    try {
      indexEntry = await archive.entry("index.html");
    } catch {
      throw new Error("Registered Construct ZIP is unreadable");
    }
    if (!indexEntry || indexEntry.isDirectory) {
      throw new Error("Registered Construct ZIP does not contain root index.html");
    }

    let indexContent: Buffer;
    try {
      indexContent = await archive.entryData(indexEntry);
    } catch {
      throw new Error("Registered Construct ZIP index.html is unreadable");
    }
    return { zipBytes: zipStat.size, indexHtmlBytes: indexContent.byteLength };
  } finally {
    await archive.close().catch(() => {});
  }
};
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

console.log(`CONSTRUCT_BENCHMARK_NODE_VERSION=${process.version}`);
console.log(`CONSTRUCT_MANAGED_PROFILE_EXISTED_BEFORE=${managedProfileExistedBefore}`);

try {
  let cpuPressureAfterLogged = false;
  try {
    const cpuPressureBefore = await readCpuPressureAvg10();
    logCpuPressure("BEFORE", cpuPressureBefore);
    const workflowStartedAt = performance.now();
    const workflowResult = await runWorkflowTask(constructExportWorkflowTaskFactory(services), {
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
    // Stop the task timer as soon as the registered workflow task returns.
    // ZIP inspection below is deliberately outside the measured duration.
    const fullExportMs = Math.round(performance.now() - workflowStartedAt);
    logCpuPressure("AFTER", await readCpuPressureAvg10());
    cpuPressureAfterLogged = true;
    if (measureFullExport) {
      const registeredZip = workflowResult.artifacts.find(
        (artifact) => artifact.artifact === "zipFile",
      );
      if (!registeredZip) throw new Error("Construct export did not register a ZIP artifact");
      const zip = await verifyRegisteredZip(registeredZip.path);
      console.log(`CONSTRUCT_FULL_EXPORT_MS=${fullExportMs}`);
      console.log(`CONSTRUCT_REGISTERED_ZIP_BYTES=${zip.zipBytes}`);
      console.log(`CONSTRUCT_REGISTERED_ZIP_INDEX_HTML_BYTES=${zip.indexHtmlBytes}`);
      console.log("CONSTRUCT_REGISTERED_ZIP_VERIFIED=true");
    }
    workflowCompleted = true;
  } catch (error) {
    if (!cpuPressureAfterLogged) {
      logCpuPressure("AFTER", await readCpuPressureAvg10());
    }
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
