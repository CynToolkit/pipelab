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
 * Creates a unique sandbox directory and returns a bundle containing its path
 * and a pre-filled remove utility.
 */
export const createSandbox = async (prefix: string) => {
    const sandboxPath = join(tmpdir(), `${prefix}-${Math.random().toString(36).substring(7)}`);
    await mkdir(sandboxPath, { recursive: true });
    
    return {
        path: sandboxPath,
        remove: async () => {
            await rm(sandboxPath, { recursive: true, force: true });
        }
    };
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
