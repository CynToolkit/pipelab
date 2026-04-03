import { expect, test, beforeAll, afterAll } from "vitest";
import { runWithLiveLogs } from "@pipelab/plugin-core";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { setupServer } from "msw/node";
import { http as mswHttp, HttpResponse } from "msw";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 1. Setup MSW handlers
const handlers = [
    mswHttp.post("https://devs-api.poki.io/v1/games/:gameId/versions", async ({ params, request }) => {
        console.log("MSW Intercepted Poki Upload for game:", params.gameId);
        return HttpResponse.json({
            id: "v123",
            game_id: params.gameId,
            success: true
        }, { status: 200 });
    }),
];

const server = setupServer(...handlers);

// 2. Setup MSW Bridge for child processes
let bridgePort: number;
const bridge = http.createServer(async (req, res) => {
    try {
        const originalProtocol = req.headers['x-msw-original-protocol'] as string;
        const originalHost = req.headers['x-msw-original-host'] as string;

        console.log(`[MSW Bridge] Received ${req.method} ${originalProtocol}//${originalHost}${req.url}`);

        // Reconstruct the original absolute URL
        const originalUrl = `${originalProtocol}//${originalHost}${req.url}`;

        // Read body
        const chunks: any[] = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        console.log(`[MSW Bridge] Body read Complete. Length: ${body.length}`);

        // Fetch from MSW (in-process)
        const fetchHeaders = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
            if (v && !k.startsWith('x-msw')) {
                if (Array.isArray(v)) v.forEach(val => fetchHeaders.append(k, val));
                else fetchHeaders.set(k, v);
            }
        }

        const mswResponse = await fetch(originalUrl, {
            method: req.method,
            headers: fetchHeaders,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
            // @ts-ignore
            duplex: 'half'
        });

        const responseBody = await mswResponse.text();
        console.log(`[MSW Bridge] MSW Response: ${mswResponse.status}, Body length: ${responseBody.length}`);
        console.log(`[MSW Bridge] MSW Body: ${responseBody.substring(0, 100)}`);

        // Forward response back to the child process
        res.statusCode = mswResponse.status;
        for (const [k, v] of mswResponse.headers.entries()) {
            // Avoid duplicate content-length if it's being set again
            if (k.toLowerCase() !== 'content-length') {
                res.setHeader(k, v);
            }
        }
        res.setHeader('Content-Length', Buffer.byteLength(responseBody));
        res.end(responseBody);

        console.log(`[MSW Bridge] Response forwarded to child.`);
    } catch (e: any) {
        console.error("MSW Bridge error:", e?.message || e);
        res.statusCode = 500;
        res.end();
    }
});

beforeAll(async () => {
    server.listen({ onUnhandledRequest: "bypass" });
    await new Promise<void>((resolve) => {
        bridge.listen(0, "localhost", () => {
            bridgePort = (bridge.address() as any).port;
            console.log(`MSW Bridge listening on port ${bridgePort}`);
            resolve();
        });
    });
});

afterAll(async () => {
    server.close();
    await new Promise((resolve) => bridge.close(resolve));
});

test("End-to-End: Poki Upload Action via Pipelab CLI", async () => {
    // 1. Setup Sandbox
    const sandboxId = `poki-e2e-${Math.random().toString(36).substring(7)}`;
    const sandboxPath = join(tmpdir(), sandboxId);
    const userDataPath = join(sandboxPath, "user-data");
    const projectPath = join(sandboxPath, "project");
    const inputPath = join(sandboxPath, "input");

    await mkdir(userDataPath, { recursive: true });
    await mkdir(projectPath, { recursive: true });
    await mkdir(inputPath, { recursive: true });

    // 2. Seed Poki CLI Auth (to avoid browser popup)
    const configPath = join(sandboxPath, "config");
    const pokiConfigPath = join(configPath, "poki");
    await mkdir(pokiConfigPath, { recursive: true });
    await writeFile(join(pokiConfigPath, "auth.json"), JSON.stringify({
        access_token: "fake-e2e-token",
        access_type: "Token"
    }));

    // Seed dummy input assets
    await writeFile(join(inputPath, "index.html"), "<html><body>Test</body></html>");

    // 3. Create Pipeline File
    const pipeline = {
        projectName: "E2E Test Project",
        projectPath: projectPath,
        pipelineId: "e2e-poki-pipeline",
        graph: [
            {
                uid: "poki-node",
                name: "Poki Upload Node",
                type: "action",
                origin: {
                    pluginId: "poki",
                    nodeId: "poki-upload"
                },
                params: {
                    "input-folder": { value: JSON.stringify(inputPath) },
                    "project": { value: JSON.stringify("poki-game-123") },
                    "name": { value: JSON.stringify("release-v1") },
                    "notes": { value: JSON.stringify("E2E test notes") }
                }
            }
        ],
        variables: []
    };
    const pipelineFile = join(sandboxPath, "pipeline.json");
    const resultFile = join(sandboxPath, "result.json");
    await writeFile(pipelineFile, JSON.stringify(pipeline, null, 2));

    // 3. Run Pipelab CLI
    const projectRoot = resolve(__dirname, "../../../");
    const cliSourcePath = resolve(projectRoot, "apps/cli/src/index.ts");
    const tsxBinary = resolve(projectRoot, "node_modules/.bin/tsx");

    console.log(`Running CLI via tsx: ${tsxBinary} ${cliSourcePath} run ${pipelineFile} --user-data ${userDataPath}`);

    // 5. Run Pipeline
    try {
        await runWithLiveLogs(
            tsxBinary,
            [
                "--import",
                join(projectRoot, "scripts", "tsx-assets-loader.mjs"),
                join(projectRoot, "apps/cli/src/index.ts"),
                "run",
                pipelineFile,
                "--user-data",
                userDataPath,
                "--output",
                resultFile
            ],
            {
                cwd: projectRoot,
                env: {
                    // to bridge child and parent process networking
                    NODE_OPTIONS: `--import "${join(projectRoot, "scripts/network-interceptor.mjs")}"`,
                    MSW_BRIDGE_PORT: bridgePort.toString(),
                    XDG_CONFIG_HOME: configPath,
                }
            },
            console.log,
            {
                onStdout: (data) => {
                    console.log('stdout');
                    // return process.stdout.write(data);
                },
                onStderr: (data) => {
                    console.log('stderr');
                    // return process.stderr.write(data);
                },
            }
        );
    } catch (e: any) {
        console.error("Execution failed:", e.message);
        throw e;
    }

    // 4. Verification

    // A. Verify build preparation (poki.json)
    const pokiJsonPath = join(projectPath, "poki.json");
    await expect(access(pokiJsonPath)).resolves.not.toThrow();

    const pokiJsonContent = JSON.parse(await readFile(pokiJsonPath, "utf-8"));
    expect(pokiJsonContent.game_id).toBe("poki-game-123");
    expect(pokiJsonContent.build_dir).toBe("dist");
    const distPath = join(projectPath, "dist");
    await expect(access(join(distPath, "index.html"))).resolves.not.toThrow();

    // B. Verify CLI Result File
    await expect(access(resultFile)).resolves.not.toThrow();
    const resultJson = JSON.parse(await readFile(resultFile, "utf-8"));

    expect(resultJson.steps).toBeDefined();
    // Result object is from processGraph, which contains the 'steps' object
    // Each entry in 'steps' is keyed by node UID
    expect(resultJson.steps["poki-node"]).toBeDefined();
    expect(resultJson.steps["poki-node"].outputs).toBeDefined();

    console.log("E2E Test Passed!");
}, 120000); // 2 minute timeout
