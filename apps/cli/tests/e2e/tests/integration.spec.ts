import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access, rm, symlink } from "node:fs/promises";
import { join, resolve, dirname as pathDirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { projectRoot } from "./utils";

const runPipeline = async (pipeline: object, sandboxPath: string, extraEnv: Record<string, string> = {}) => {
    const pipelineFile = join(sandboxPath, "pipeline.json");
    const resultFile = join(sandboxPath, "result.json");
    await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));
    const cliSourcePath = resolve(projectRoot, "apps/cli/src/index.ts");
    const tsxBinary = resolve(projectRoot, "node_modules/.bin/tsx");

    await runWithLiveLogs(
        tsxBinary,
        [
            "--import",
            join(projectRoot, "scripts", "tsx-assets-loader.mjs"),
            cliSourcePath,
            "run",
            pipelineFile,
            "--output",
            resultFile,
            "--user-data",
            sandboxPath
        ],
        {
            cwd: projectRoot,
            env: {
                ...process.env,
                ...extraEnv
            }
        },
        console.log,
        {
            onStdout: (data) => console.log('stdout', data.toString()),
            onStderr: (data) => console.log('stderr', data.toString()),
        }
    );

    return JSON.parse(await readFile(resultFile, "utf-8"));
};

describe("End-to-End: Multi-Plugin Integration Test", () => {
    let sandboxPath: string;

    beforeAll(async () => {
        sandboxPath = join(tmpdir(), `integration-e2e-${Math.random().toString(36).substring(7)}`);
        await mkdir(sandboxPath, { recursive: true });

        // Symlink real thirdparty to avoid downloads but keep using real binaries
        const realThirdParty = join(homedir(), ".config", "@pipelab", "app", "thirdparty");
        const sandboxThirdParty = join(sandboxPath, "thirdparty");
        await mkdir(pathDirname(sandboxThirdParty), { recursive: true });
        try {
            await symlink(realThirdParty, sandboxThirdParty, "dir");
        } catch (e) {
            console.warn("Could not symlink thirdparty, falling back to download", e);
        }
    });

    afterAll(async () => {
        if (sandboxPath) {
            await rm(sandboxPath, { recursive: true, force: true });
        }
    });

    test("should run a pipeline with filesystem and electron nodes", async () => {
        const projectSourcePath = join(sandboxPath, "my-app-source");
        const projectStagingPath = join(sandboxPath, "my-app-staging");
        await mkdir(projectSourcePath, { recursive: true });

        // Create initial source files
        await writeFile(join(projectSourcePath, "package.json"), JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" }));
        await writeFile(join(projectSourcePath, "index.js"), "console.log('hello integration test')");
        await writeFile(join(projectSourcePath, "index.html"), "<h1>Hello Integration</h1>");

        const pipeline = {
            graph: [
                {
                    uid: "copy-to-staging",
                    name: "Copy to Staging",
                    type: "action",
                    origin: { pluginId: "filesystem", nodeId: "fs:copy" },
                    params: {
                        "from": { value: JSON.stringify(projectSourcePath) },
                        "to": { value: JSON.stringify(projectStagingPath) },
                        "recursive": { value: JSON.stringify(true) },
                        "overwrite": { value: JSON.stringify(true) },
                        "cleanup": { value: JSON.stringify(false) }
                    }
                },
                {
                    uid: "package-electron-app",
                    name: "Package Electron App",
                    type: "action",
                    origin: { pluginId: "electron", nodeId: "electron:package" },
                    params: {
                        "input-folder": { value: JSON.stringify(projectStagingPath) },
                        "configuration": { value: JSON.stringify({ name: "my-app" }) }
                    },
                    dependsOn: ["copy-to-staging"]
                }
            ],
            projectPath: sandboxPath,
            projectName: "Integration E2E Test"
        };

        const resultJson = await runPipeline(pipeline, sandboxPath);

        // Verification
        expect(resultJson.steps["copy-to-staging"]).toBeDefined();
        expect(resultJson.steps["package-electron-app"]).toBeDefined();

        // Verify output exists in the sandbox build folder (relative to staging path)
        const outputDir = join(sandboxPath, "build", "out", "my-app-linux-x64");
        await expect(access(outputDir)).resolves.not.toThrow();
    }, 600000); // 10 minutes timeout for real build
});
