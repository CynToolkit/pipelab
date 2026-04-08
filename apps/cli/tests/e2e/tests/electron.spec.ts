import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access, chmod, rm } from "node:fs/promises";
import { join, resolve, dirname as pathDirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { projectRoot } from "./utils";
import { symlink } from "node:fs/promises";


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

describe("End-to-End: Electron Plugin", () => {
    let sandboxPath: string;
    let mockBinPath: string;
    let mockElectronBuilderPath: string;
    let argsFile: string;

    beforeAll(async () => {
        sandboxPath = join(tmpdir(), `electron-e2e-${Math.random().toString(36).substring(7)}`);
        mockBinPath = join(sandboxPath, "mock_bin");
        argsFile = join(sandboxPath, "electron-builder-args.txt");
        mockElectronBuilderPath = join(mockBinPath, "electron-builder");

        await mkdir(mockBinPath, { recursive: true });

        const shellMockScript = `#!/bin/sh
echo "$@" > "$ARGS_FILE"
# Try to find the project dir to create a fake output
project_dir_arg=$(echo "$@" | grep -o -E '--project=[^ ]+' | cut -d'=' -f2)
if [ -n "$project_dir_arg" ]; then
    out_dir="$project_dir_arg/dist/linux-unpacked"
    mkdir -p "$out_dir"
    echo "fake executable" > "$out_dir/my-app"
fi
exit 0
`;

        await writeFile(mockElectronBuilderPath, shellMockScript);
        await chmod(mockElectronBuilderPath, 0o755);
    });

    afterAll(async () => {
        if (sandboxPath) {
            await rm(sandboxPath, { recursive: true, force: true });
        }
    });

    test("should package a project using 'electron-package' node", async () => {
        // 1. Setup a dummy project to package
        const projectToPackage = join(sandboxPath, "my-app");
        await mkdir(projectToPackage, { recursive: true });
        await writeFile(join(projectToPackage, "package.json"), JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" }));
        await writeFile(join(projectToPackage, "index.js"), "console.log('hello electron')");
        await writeFile(join(projectToPackage, "index.html"), "<h1>Hello Electron</h1>");

        // Symlink real thirdparty to avoid downloads but keep using real binaries
        const realThirdParty = join(homedir(), ".config", "@pipelab", "app", "thirdparty");
        const sandboxThirdParty = join(sandboxPath, "thirdparty");
        await mkdir(pathDirname(sandboxThirdParty), { recursive: true });
        try {
            await symlink(realThirdParty, sandboxThirdParty, "dir");
        } catch (e) {
            console.warn("Could not symlink thirdparty, falling back to download", e);
        }

        // 2. Create the pipeline
        const pipeline = {
            graph: [{
                uid: "electron-node",
                name: "Electron Package Node",
                type: "action",
                origin: { pluginId: "electron", nodeId: "electron:package" },
                params: {
                    "input-folder": { value: JSON.stringify(projectToPackage) },
                    "configuration": { value: JSON.stringify({ name: "my-app" }) }
                }
            }],
            projectPath: sandboxPath,
            projectName: "Electron E2E Test"
        };

        // 3. Run the pipeline
        const resultJson = await runPipeline(pipeline, sandboxPath);

        // 4. Verification
        expect(resultJson.steps["electron-node"]).toBeDefined();

        // Verify output exists in the sandbox build folder
        const outputDir = join(sandboxPath, "build", "out", "my-app-linux-x64");
        await expect(access(outputDir)).resolves.not.toThrow();
    }, 600000); // Increased timeout to 10 minutes for real build (including pnpm install)
});

