import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access, chmod, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { projectRoot } from "./utils";


describe("End-to-End: Multi-Plugin Integration Test", () => {
    let sandboxPath: string;
    let mockBinPath: string;
    let argsFile: string;

    beforeAll(async () => {
        sandboxPath = join(tmpdir(), `integration-e2e-${Math.random().toString(36).substring(7)}`);
        mockBinPath = join(sandboxPath, "mock_bin");
        argsFile = join(sandboxPath, "electron-builder-args.txt");
        const mockElectronBuilderPath = join(mockBinPath, "electron-builder");

        await mkdir(mockBinPath, { recursive: true });
        
        const shellMockScript = `#!/bin/sh
echo "$@" > "$ARGS_FILE"
# Create a fake output directory
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

    test("should run a pipeline with filesystem and electron nodes", async () => {
        const projectSourcePath = join(sandboxPath, "my-app-source");
        await mkdir(projectSourcePath, { recursive: true });

        const pipeline = {
            graph: [
                {
                    uid: "create-package-json",
                    name: "Create package.json",
                    type: "action",
                    origin: { pluginId: "filesystem", nodeId: "write-file" },
                    params: {
                        "path": { value: JSON.stringify(join(projectSourcePath, "package.json")) },
                        "content": { value: JSON.stringify(JSON.stringify({ name: "my-app", version: "1.0.0", main: "index.js" })) }
                    }
                },
                {
                    uid: "create-index-js",
                    name: "Create index.js",
                    type: "action",
                    origin: { pluginId: "filesystem", nodeId: "write-file" },
                    params: {
                        "path": { value: JSON.stringify(join(projectSourcePath, "index.js")) },
                        "content": { value: JSON.stringify("console.log('hello integration test')") }
                    }
                },
                {
                    uid: "package-electron-app",
                    name: "Package Electron App",
                    type: "action",
                    origin: { pluginId: "electron", nodeId: "package" },
                    params: {
                        "path": { value: JSON.stringify(projectSourcePath) },
                        "targets": { value: JSON.stringify(["linux"]) }
                    },
                    dependsOn: ["create-package-json", "create-index-js"]
                }
            ]
        };
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
                resultFile
            ],
            {
                cwd: projectRoot,
                env: {
                    ...process.env,
                    PATH: `${mockBinPath}:${process.env.PATH}`,
                    ARGS_FILE: argsFile
                }
            },
            console.log
        );

        // Verification
        await expect(access(argsFile)).resolves.not.toThrow();
        const receivedArgs = await readFile(argsFile, "utf-8");
        expect(receivedArgs).toContain("--linux");
        expect(receivedArgs).toContain(`--project=${projectSourcePath}`);

        const resultJson = JSON.parse(await readFile(resultFile, "utf-8"));
        expect(resultJson.steps["package-electron-app"]?.status).toBe("success");
    }, 120000);
});
