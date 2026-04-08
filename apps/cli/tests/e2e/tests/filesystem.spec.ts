import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { projectRoot } from "./utils";


const runPipeline = async (pipeline: object, sandboxPath: string) => {
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
            env: { ...process.env }
        },
        console.log,
        {
            onStdout: (data) => console.log('stdout', data.toString()),
            onStderr: (data) => console.log('stderr', data.toString()),
        }
    );

    return JSON.parse(await readFile(resultFile, "utf-8"));
};

describe("End-to-End: Filesystem Plugin", () => {
    let sandboxPath: string;

    beforeAll(async () => {
        const sandboxId = `fs-e2e-${Math.random().toString(36).substring(7)}`;
        sandboxPath = join(tmpdir(), sandboxId);
    });

    afterAll(async () => {
        if (sandboxPath) {
            await rm(sandboxPath, { recursive: true, force: true });
        }
    });

    test("should copy a file using 'copy' node", { timeout: 60000 }, async () => {
        const testPath = join(sandboxPath, 'copy');
        const sourcePath = join(testPath, "source");
        const destPath = join(testPath, "destination");
        await mkdir(sourcePath, { recursive: true });
        await mkdir(destPath, { recursive: true });

        const sourceFile = join(sourcePath, "file.txt");
        const destFile = join(destPath, "file.txt");
        await writeFile(sourceFile, "Hello World");

        const pipeline = {
            graph: [{
                uid: "copy-node",
                name: "Copy File Node",
                type: "action",
                origin: { pluginId: "filesystem", nodeId: "fs:copy" },
                params: {
                    "from": { value: JSON.stringify(sourceFile) },
                    "to": { value: JSON.stringify(destFile) },
                    "recursive": { value: JSON.stringify(false) },
                    "overwrite": { value: JSON.stringify(false) },
                    "cleanup": { value: JSON.stringify(false) },
                }
            }]
        };

        const result = await runPipeline(pipeline, testPath);

        console.log("destFile", destFile);
        console.log("result", result);
        await expect(access(destFile)).resolves.not.toThrow();
        const content = await readFile(destFile, "utf-8");
        expect(content).toBe("Hello World");
    });

    test("should move a file using 'move' node", { timeout: 60000 }, async () => {
        const testPath = join(sandboxPath, 'move');
        const sourcePath = join(testPath, "source");
        const destPath = join(testPath, "destination");
        await mkdir(sourcePath, { recursive: true });
        await mkdir(destPath, { recursive: true });

        const sourceFile = join(sourcePath, "file.txt");
        const destFile = join(destPath, "file.txt");
        await writeFile(sourceFile, "File to move");

        const pipeline = {
            graph: [
                {
                    uid: "copy-node-move",
                    name: "Copy for move",
                    type: "action",
                    origin: { pluginId: "filesystem", nodeId: "fs:copy" },
                    params: {
                        "from": { value: JSON.stringify(sourceFile) },
                        "to": { value: JSON.stringify(destFile) },
                        "recursive": { value: JSON.stringify(false) },
                        "overwrite": { value: JSON.stringify(false) },
                        "cleanup": { value: JSON.stringify(false) },
                    }
                },
                {
                    uid: "delete-node-move",
                    name: "Delete for move",
                    type: "action",
                    origin: { pluginId: "filesystem", nodeId: "fs:remove" },
                    params: {
                        "from": { value: JSON.stringify(sourceFile) },
                        "recursive": { value: JSON.stringify(true) }
                    }
                }
            ]
        };

        await runPipeline(pipeline, testPath);

        await expect(access(destFile)).resolves.not.toThrow();
        await expect(access(sourceFile)).rejects.toThrow();
    });

    test("should delete a file using 'delete' node", { timeout: 60000 }, async () => {
        const testPath = join(sandboxPath, 'delete');
        await mkdir(testPath, { recursive: true });
        const fileToDelete = join(testPath, "file_to_delete.txt");
        await writeFile(fileToDelete, "Delete me");

        const pipeline = {
            graph: [{
                uid: "remove-node",
                name: "Remove File Node",
                type: "action",
                origin: { pluginId: "filesystem", nodeId: "fs:remove" },
                params: {
                    "from": { value: JSON.stringify(fileToDelete) },
                    "recursive": { value: JSON.stringify(true) }
                }
            }]
        };

        await runPipeline(pipeline, testPath);

        await expect(access(fileToDelete)).rejects.toThrow();
    });
});
