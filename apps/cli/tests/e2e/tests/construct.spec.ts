import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { projectRoot, fixturesPath } from "./utils";

const runPipeline = async (pipeline: object, sandboxPath: string) => {
    const pipelineFile = join(sandboxPath, "pipeline.json");
    const resultFile = join(sandboxPath, "result.json");
    await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));
    const cliSourcePath = resolve(projectRoot, "apps/cli/src/index.ts");
    const tsxBinary = resolve(projectRoot, "node_modules/.bin/tsx");

    const result = await runWithLiveLogs(
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
            cwd: sandboxPath,
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

describe("End-to-End: Construct 3 Export Pipeline", () => {
    let sandboxPath: string;

    beforeAll(async () => {
        sandboxPath = join(tmpdir(), `c3-pipeline-e2e-${Math.random().toString(36).substring(7)}`);
        await mkdir(sandboxPath, { recursive: true });
    });

    afterAll(async () => {
        if (sandboxPath) {
            await rm(sandboxPath, { recursive: true, force: true });
        }
    });

    test("should run the full C3 export pipeline", async () => {
        // This test runs a pipeline that uses the construct plugin.
        // It's an integration test migrated from the legacy 'basic.spec.ts'.
        // As per the user's note, this pipeline performs file operations and requires no mocking.

        // The old test used a fixture, we will replicate that by assuming the pipeline
        // is self-contained or its inputs are relative to the project root.
        const fixtures = fixturesPath;
        const jsonProject = JSON.parse(await readFile(join(fixtures, "c3-export.json"), "utf-8"));

        // Adjust the path in the fixture to be absolute for the test environment
        const testC3pPath = resolve(fixtures, "c3-export/test.c3p");
        if (jsonProject.canvas?.blocks?.[0]?.params?.file) {
            jsonProject.canvas.blocks[0].params.file.value = JSON.stringify(testC3pPath);
        }

        // Set the projectPath to sandboxPath to ensure outputs go there
        jsonProject.projectPath = sandboxPath;

        // The pipeline likely uses relative paths, so we'll run it from a temp dir
        // and adjust paths if needed. For now, we assume it's runnable as is.
        const result = await runPipeline(jsonProject, sandboxPath);

        // Verification based on the old test's expectations
        expect(result.steps).toBeDefined();
        const outputs = result.steps["export-construct-project"]?.outputs;
        expect(outputs).toBeDefined();

        expect(outputs.folder).toEqual(expect.any(String));
        expect(outputs.parentFolder).toEqual(expect.any(String));
        expect(outputs.zipFile).toEqual(expect.any(String));

        // Verify that the output files/folders actually exist
        await expect(access(outputs.folder)).resolves.not.toThrow();
        await expect(access(outputs.parentFolder)).resolves.not.toThrow();
        await expect(access(outputs.zipFile)).resolves.not.toThrow();

    }, 120000);
});
