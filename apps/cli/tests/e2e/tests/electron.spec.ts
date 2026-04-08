import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access, chmod, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { projectRoot } from "./utils";


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

        // 2. Create the pipeline
        const pipeline = {
            graph: [{
                uid: "electron-node",
                name: "Electron Package Node",
                type: "action",
                origin: { pluginId: "electron", nodeId: "package" },
                params: {
                    "path": { value: JSON.stringify(projectToPackage) },
                    "targets": { value: JSON.stringify(["linux"]) }
                }
            }]
        };
        const pipelineFile = join(sandboxPath, "pipeline.json");
        const resultFile = join(sandboxPath, "result.json");
        await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));

        // 3. Run the pipeline
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
                resultFile
            ],
            {
                cwd: projectRoot,
                env: {
                    ...process.env,
                    // Prepend our mock bin to the PATH
                    PATH: `${mockBinPath}:${process.env.PATH}`,
                    // Pass a variable to our mock script
                    ARGS_FILE: argsFile
                }
            },
            console.log,
            {
                onStdout: (data) => console.log('stdout', data.toString()),
                onStderr: (data) => console.log('stderr', data.toString()),
            }
        );

        // 4. Verification
        await expect(access(argsFile)).resolves.not.toThrow();
        const receivedArgs = await readFile(argsFile, "utf-8");
        expect(receivedArgs).toContain("--linux");
        expect(receivedArgs).toContain(`--project=${projectToPackage}`);

        await expect(access(resultFile)).resolves.not.toThrow();
        const resultJson = JSON.parse(await readFile(resultFile, "utf-8"));
        expect(resultJson.steps["electron-node"]).toBeDefined();
        expect(resultJson.steps["electron-node"].status).toBe("success");
    }, 120000);
});
