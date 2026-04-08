import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { runWithLiveLogs } from "@pipelab/plugin-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Robustly resolves the project root relative to this utility file.
 */
export const projectRoot = resolve(__dirname, "../../../../../");

/**
 * Robustly resolves the fixtures path relative to this utility file.
 */
export const fixturesPath = resolve(__dirname, "../fixtures");

/**
 * Generates a unique sandbox path in the OS temp directory.
 */
export const generateSandboxPath = (prefix: string) => {
    return join(tmpdir(), `${prefix}-${Math.random().toString(36).substring(7)}`);
};

/**
 * Sets up a sandbox directory, optionally symlinking the thirdparty directory
 * to avoid downloading binaries repeatedly during tests.
 */
export const setupSandbox = async (sandboxPath: string, options: { symlinkThirdParty?: boolean } = {}) => {
    await mkdir(sandboxPath, { recursive: true });

    if (options.symlinkThirdParty) {
        const realThirdParty = join(homedir(), ".config", "@pipelab", "app", "thirdparty");
        const sandboxThirdParty = join(sandboxPath, "thirdparty");
        const sandboxThirdPartyParent = dirname(sandboxThirdParty);
        
        await mkdir(sandboxThirdPartyParent, { recursive: true });
        try {
            await symlink(realThirdParty, sandboxThirdParty, "dir");
        } catch (e) {
            console.warn(`Could not symlink thirdparty to ${sandboxThirdParty}, falling back to download`, e);
        }
    }
};

/**
 * Cleans up a sandbox directory.
 */
export const cleanupSandbox = async (sandboxPath: string) => {
    if (sandboxPath) {
        await rm(sandboxPath, { recursive: true, force: true });
    }
};

/**
 * Runs a Pipelab pipeline using the CLI.
 */
export const runPipeline = async (
    pipeline: object,
    sandboxPath: string,
    options: {
        extraEnv?: Record<string, string>;
        userData?: string;
        cwd?: string;
    } = {}
) => {
    const pipelineFile = join(sandboxPath, "pipeline.json");
    const resultFile = join(sandboxPath, "result.json");
    await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));
    
    const cliSourcePath = resolve(projectRoot, "apps/cli/src/index.ts");
    const tsxBinary = resolve(projectRoot, "node_modules/.bin/tsx");

    const args = [
        "--import",
        join(projectRoot, "scripts", "tsx-assets-loader.mjs"),
        cliSourcePath,
        "run",
        pipelineFile,
        "--output",
        resultFile,
    ];

    if (options.userData) {
        args.push("--user-data", options.userData);
    }

    await runWithLiveLogs(
        tsxBinary,
        args,
        {
            cwd: options.cwd || projectRoot,
            env: {
                ...process.env,
                ...options.extraEnv,
            }
        },
        console.log,
        {
            onStdout: (data) => console.log('stdout', data.toString()),
            onStderr: (data) => console.log('stderr', data.toString()),
        }
    );

    const resultRaw = await readFile(resultFile, "utf-8");
    return JSON.parse(resultRaw);
};
