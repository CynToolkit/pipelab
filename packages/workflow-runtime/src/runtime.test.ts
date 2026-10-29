import { describe, expect, it } from "vitest";
import { definePhases, runWorkflow, type WorkflowHost } from "./index";

const host: WorkflowHost = {
  workspace: { root: "/tmp" },
  filesystem: { ensureDirectory: async () => undefined },
  processes: { execute: async () => ({ exitCode: 0, stdout: "", stderr: "", duration: 0 }) },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
};

describe("artifact-aware workflow runtime", () => {
  it("runs a native task with resolved inputs, prior outputs, artifacts, services, cancellation, and logging", async () => {
    const logs: string[] = [];
    const events: string[] = [];
    const controller = new AbortController();
    const result = await runWorkflow<{ pipelab: string }>(
      {
        version: 1,
        steps: [
          {
            id: "build",
            uses: "test:build",
            artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
          },
          {
            id: "native",
            uses: "test:native",
            with: { input: "${{ steps.build.outputs.value }}" },
          },
        ],
      },
      {
        host: {
          ...host,
          logger: { ...host.logger, info: (...args) => logs.push(args.join(" ")) },
        },
        signal: controller.signal,
        services: { pipelab: "injected" },
        tasks: {
          "test:build": async ({ setArtifact }) => {
            setArtifact("output", "/workspace/dist");
            return { value: "ready" };
          },
          "test:native": async (context) => {
            expect(context.inputs).toEqual({ input: "ready" });
            expect(context.outputs.build).toEqual({ value: "ready" });
            expect(context.artifacts).toEqual([
              expect.objectContaining({
                stepId: "build",
                artifact: "output",
                path: "/workspace/dist",
              }),
            ]);
            expect(context.services.pipelab).toBe("injected");
            expect(context.signal).toBe(controller.signal);
            context.log("native task ran");
            return { completed: true };
          },
        },
        onEvent: (event) => {
          if (event.type === "step.log") events.push(event.message);
        },
      },
    );

    expect(result.outputs.native).toEqual({ completed: true });
    expect(logs).toContain("native task ran");
    expect(events).toContain("native task ran");
  });

  it("resolves environment references while redacting their values from logs and results", async () => {
    const username = "construct-user@example.test";
    const password = "construct-password-secret";
    let received: Record<string, unknown> | undefined;
    const logs: string[] = [];
    const events: unknown[] = [];

    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          {
            id: "login",
            uses: "test:login",
            with: {
              username: "${{ env.CONSTRUCT_USERNAME }}",
              password: "${{ env.CONSTRUCT_PASSWORD }}",
              label: "Login for ${{ env.CONSTRUCT_USERNAME }}",
            },
          },
        ],
      },
      {
        host: {
          ...host,
          logger: { ...host.logger, info: (...args) => logs.push(args.join(" ")) },
        },
        env: { CONSTRUCT_USERNAME: username, CONSTRUCT_PASSWORD: password },
        tasks: {
          "test:login": async ({ inputs, log }) => {
            received = inputs;
            log("Resolved password", inputs.password);
            return { saved: inputs.password };
          },
        },
        onEvent: (event) => events.push(event),
      },
    );

    expect(received).toEqual({
      username,
      password,
      label: `Login for ${username}`,
    });
    const persistedOutput = JSON.stringify({ result, logs, events });
    expect(persistedOutput).not.toContain(username);
    expect(persistedOutput).not.toContain(password);
    expect(persistedOutput).toContain("[REDACTED]");
  });

  it("accepts an explicitly empty environment value as set", async () => {
    let received: unknown;

    await runWorkflow(
      {
        version: 1,
        steps: [{ id: "consume", uses: "test:consume", with: { token: "${{ env.EMPTY_TOKEN }}" } }],
      },
      {
        host,
        env: { EMPTY_TOKEN: "" },
        tasks: {
          "test:consume": async ({ inputs }) => {
            received = inputs.token;
          },
        },
      },
    );

    expect(received).toBe("");
  });

  it("uses the environment values captured at run start", async () => {
    const env = { RUN_TOKEN: "initial-token" };
    let received: unknown;

    await runWorkflow(
      {
        version: 1,
        steps: [
          { id: "prepare", uses: "test:prepare" },
          {
            id: "consume",
            uses: "test:consume",
            with: { token: "${{ env.RUN_TOKEN }}" },
          },
        ],
      },
      {
        host,
        env,
        tasks: {
          "test:prepare": async () => {
            env.RUN_TOKEN = "changed-during-run";
          },
          "test:consume": async ({ inputs }) => {
            received = inputs.token;
          },
        },
      },
    );

    expect(received).toBe("initial-token");
  });

  it("merges disjoint run-scoped Connection values and overrides, then redacts them", async () => {
    const environmentPassword = "connection-env-secret";
    const literalToken = "literal=connection-secret";
    const events: unknown[] = [];
    let received: unknown;

    const result = await runWorkflow(
      {
        version: 1,
        steps: [{ id: "publish", uses: "test:publish" }],
      },
      {
        host,
        env: { PUBLISH_PASSWORD: environmentPassword },
        connectionValues: { itch: { user: "saved-user" } },
        connectionOverrides: [
          { alias: "itch", field: "account", value: { kind: "literal", value: literalToken } },
          {
            alias: "itch",
            field: "password",
            value: { kind: "environment", name: "PUBLISH_PASSWORD" },
          },
        ],
        tasks: {
          "test:publish": async ({ connectionValues, log }) => {
            received = connectionValues;
            log(literalToken, environmentPassword);
            return { credentials: connectionValues?.itch };
          },
        },
        onEvent: (event) => events.push(event),
      },
    );

    expect(received).toEqual({
      itch: { user: "saved-user", account: literalToken, password: environmentPassword },
    });
    expect(JSON.stringify({ result, events })).not.toContain(literalToken);
    expect(JSON.stringify({ result, events })).not.toContain(environmentPassword);
    expect(JSON.stringify({ result, events })).toContain("[REDACTED]");
  });

  it("rejects a CLI override when the same field already has a run-scoped value", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
        {
          host,
          connectionRequirements: [
            {
              alias: "release",
              required: true,
              fields: [{ key: "credential", required: true }],
            },
          ],
          connectionValues: { release: { credential: "desktop-value" } },
          connectionOverrides: [
            {
              alias: "release",
              field: "credential",
              value: { kind: "literal", value: "cli-value" },
            },
          ],
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Workflow Connection field 'release.credential' is mapped more than once.");

    expect(sideEffectStarted).toBe(false);
  });

  it("preserves an explicitly supplied alias with no field values", async () => {
    let received: unknown;

    await runWorkflow(
      {
        version: 1,
        steps: [{ id: "publish", uses: "test:publish" }],
      },
      {
        host,
        connectionValues: { itch: {} },
        tasks: {
          "test:publish": async ({ connectionValues }) => {
            received = connectionValues;
          },
        },
      },
    );

    expect(received).toEqual({ itch: {} });
  });

  it("preflights missing connection environment values before starting any task", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [{ id: "prepare", uses: "test:prepare" }],
        },
        {
          host,
          connectionOverrides: [
            {
              alias: "steam",
              field: "password",
              value: { kind: "environment", name: "STEAM_PASSWORD" },
            },
          ],
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Workflow environment variable is not set: STEAM_PASSWORD");

    expect(sideEffectStarted).toBe(false);
  });

  it("preflights an empty required environment binding before starting any task", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            { id: "prepare", uses: "test:prepare", with: { version: "${{ env.BUILD_VERSION }}" } },
          ],
        },
        {
          host,
          env: { BUILD_VERSION: "" },
          requiredEnvironmentVariables: ["BUILD_VERSION"],
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Workflow environment variable is empty: BUILD_VERSION");

    expect(sideEffectStarted).toBe(false);
  });

  it("preflights missing required Connection fields before starting any task", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
        {
          host,
          connectionRequirements: [
            {
              alias: "release",
              required: true,
              fields: [{ key: "credential", required: true }],
            },
          ],
          connectionValues: { release: {} },
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Required workflow Connection field is missing: release.credential");

    expect(sideEffectStarted).toBe(false);
  });

  it("preflights a missing required Connection alias before starting any task", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
        {
          host,
          connectionRequirements: [
            {
              alias: "release",
              required: true,
              fields: [{ key: "credential", required: true }],
            },
          ],
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Required workflow Connection alias is missing: release");

    expect(sideEffectStarted).toBe(false);
  });

  it("allows an optional Connection alias to remain unbound", async () => {
    let taskStarted = false;

    await runWorkflow(
      { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
      {
        host,
        connectionRequirements: [
          {
            alias: "optional-release",
            required: false,
            fields: [{ key: "credential", required: true }],
          },
        ],
        tasks: {
          "test:prepare": async () => {
            taskStarted = true;
          },
        },
      },
    );

    expect(taskStarted).toBe(true);
  });

  it("preflights an empty required Connection environment value before starting any task", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
        {
          host,
          env: { RELEASE_CREDENTIAL: "" },
          connectionRequirements: [
            {
              alias: "release",
              required: true,
              fields: [{ key: "credential", required: true }],
            },
          ],
          connectionOverrides: [
            {
              alias: "release",
              field: "credential",
              value: { kind: "environment", name: "RELEASE_CREDENTIAL" },
            },
          ],
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Required workflow Connection field is empty: release.credential");

    expect(sideEffectStarted).toBe(false);
  });

  it.each([
    [
      { other: { credential: "token" } },
      undefined,
      "Workflow Connection alias 'other' is not declared.",
    ],
    [
      undefined,
      [{ alias: "release", field: "unknown", value: { kind: "literal", value: "x" } }],
      "Workflow Connection alias 'release' does not define field 'unknown'.",
    ],
  ] as const)(
    "rejects values outside the workflow's Connection requirements before task execution",
    async (connectionValues, connectionOverrides, message) => {
      let sideEffectStarted = false;

      await expect(
        runWorkflow(
          { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
          {
            host,
            connectionRequirements: [
              {
                alias: "release",
                required: true,
                fields: [{ key: "credential", required: true }],
              },
            ],
            connectionValues,
            connectionOverrides,
            tasks: {
              "test:prepare": async () => {
                sideEffectStarted = true;
              },
            },
          },
        ),
      ).rejects.toThrow(message);

      expect(sideEffectStarted).toBe(false);
    },
  );

  it("rejects duplicate mappings for the same Connection field before task execution", async () => {
    let sideEffectStarted = false;
    const duplicateOverrides = [
      { alias: "release", field: "credential", value: { kind: "literal" as const, value: "one" } },
      { alias: "release", field: "credential", value: { kind: "literal" as const, value: "two" } },
    ];

    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "prepare", uses: "test:prepare" }] },
        {
          host,
          connectionRequirements: [
            {
              alias: "release",
              required: true,
              fields: [{ key: "credential", required: true }],
            },
          ],
          connectionOverrides: duplicateOverrides,
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Workflow Connection field 'release.credential' is mapped more than once.");

    expect(sideEffectStarted).toBe(false);
  });

  it("preflights an invalid persisted environment binding before starting any task", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "prepare",
              uses: "test:prepare",
              with: { label: "${{ env.BUILD-LABEL }}" },
            },
          ],
        },
        {
          host,
          env: { "BUILD-LABEL": "release" },
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
          },
        },
      ),
    ).rejects.toThrow("Invalid environment variable reference: env.BUILD-LABEL");

    expect(sideEffectStarted).toBe(false);
  });

  it.each(["BUILD{LABEL", "BUILD}LABEL"])(
    "preflights malformed environment references containing braces: %s",
    async (name) => {
      let sideEffectStarted = false;

      await expect(
        runWorkflow(
          {
            version: 1,
            steps: [
              {
                id: "prepare",
                uses: "test:prepare",
                with: { label: `\${{ env.${name} }}` },
              },
            ],
          },
          {
            host,
            env: { [name]: "release" },
            tasks: {
              "test:prepare": async () => {
                sideEffectStarted = true;
              },
            },
          },
        ),
      ).rejects.toThrow(`Invalid environment variable reference: env.${name}`);

      expect(sideEffectStarted).toBe(false);
    },
  );

  it("preserves artifact paths in returned results while redacting them from events", async () => {
    const artifactRoot = "/workspace/construct-profile";
    const token = "construct-session-token";
    const events: unknown[] = [];

    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          {
            id: "export",
            uses: "test:export",
            with: {
              root: "${{ env.CONSTRUCT_ROOT }}",
              token: "${{ env.CONSTRUCT_TOKEN }}",
            },
            artifacts: {
              output: {
                descriptor: { kind: "application", platform: "web", container: "directory" },
              },
            },
          },
        ],
      },
      {
        host,
        env: { CONSTRUCT_ROOT: artifactRoot, CONSTRUCT_TOKEN: token },
        tasks: {
          "test:export": async ({ inputs, setArtifact }) => {
            setArtifact("output", `${String(inputs.root)}/export`);
            return { token: inputs.token };
          },
        },
        onEvent: (event) => events.push(event),
      },
    );

    expect(result.artifacts[0]?.path).toBe(`${artifactRoot}/export`);
    expect(result.steps.export?.artifacts[0]?.path).toBe(`${artifactRoot}/export`);
    expect(result.outputs.export?.token).toBe("[REDACTED]");
    expect(JSON.stringify(events)).not.toContain(artifactRoot);
    expect(JSON.stringify(events)).not.toContain(token);
  });

  it("resolves references with large amounts of surrounding whitespace", async () => {
    const paddedReference = `\${{${" ".repeat(10_000)}env.VALUE${" ".repeat(10_000)}}}`;
    let resolvedValue: unknown;
    const result = await runWorkflow(
      {
        version: 1,
        steps: [{ id: "resolve", uses: "test:resolve", with: { value: paddedReference } }],
      },
      {
        host,
        env: { VALUE: "resolved" },
        tasks: {
          "test:resolve": async ({ inputs }) => {
            resolvedValue = inputs.value;
            return { value: inputs.value };
          },
        },
      },
    );

    expect(resolvedValue).toBe("resolved");
    expect(result.outputs.resolve?.value).toBe("[REDACTED]");
  });

  it("leaves a long sequence of unmatched reference openings untouched", async () => {
    const malformed = "${{ {{a".repeat(20_000);
    let received: unknown;

    await runWorkflow(
      {
        version: 1,
        steps: [{ id: "resolve", uses: "test:resolve", with: { value: malformed } }],
      },
      {
        host,
        tasks: {
          "test:resolve": async ({ inputs }) => {
            received = inputs.value;
          },
        },
      },
    );

    expect(received).toBe(malformed);
  }, 500);

  it("names a missing environment variable without exposing a value", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "login",
              uses: "test:login",
              with: { password: "${{ env.CONSTRUCT_PASSWORD }}" },
            },
          ],
        },
        { host, tasks: { "test:login": async () => undefined } },
      ),
    ).rejects.toThrow("Workflow environment variable is not set: CONSTRUCT_PASSWORD");
  });

  it("preflights missing environment variables before running any workflow step", async () => {
    let sideEffectStarted = false;

    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            { id: "prepare", uses: "test:prepare" },
            {
              id: "publish",
              uses: "test:publish",
              with: { token: "${{ env.PUBLISH_TOKEN }}" },
            },
          ],
        },
        {
          host,
          tasks: {
            "test:prepare": async () => {
              sideEffectStarted = true;
            },
            "test:publish": async () => undefined,
          },
        },
      ),
    ).rejects.toThrow("Workflow environment variable is not set: PUBLISH_TOKEN");

    expect(sideEffectStarted).toBe(false);
  });

  it("redacts environment values from task errors", async () => {
    const password = "construct-password-secret";
    const events: unknown[] = [];
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "login",
              uses: "test:login",
              with: { password: "${{ env.CONSTRUCT_PASSWORD }}" },
            },
          ],
        },
        {
          host,
          env: { CONSTRUCT_PASSWORD: password },
          tasks: {
            "test:login": async ({ inputs }) => {
              throw new Error(`Construct rejected ${String(inputs.password)}`);
            },
          },
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow("Construct rejected [REDACTED]");
    expect(JSON.stringify(events)).not.toContain(password);
  });

  it("materializes declared artifact descriptors without a global registry", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: {
            output: {
              descriptor: { kind: "application", platform: "windows", container: "directory" },
            },
          },
        },
        {
          id: "deliver",
          uses: "test:deliver",
          needs: ["build"],
          delivery: {
            destinationId: "folder",
            slotId: "windows",
            artifact: { stepId: "build", artifact: "output" },
          },
        },
      ],
    } as const;
    let deliveredPath = "";
    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => {
          setArtifact("output", "/tmp/game");
        },
        "test:deliver": async ({ delivery }) => {
          deliveredPath = delivery!.artifact.path;
        },
      },
    });
    expect(deliveredPath).toBe("/tmp/game");
    expect(result.steps.deliver.delivery?.artifactId).toBeTruthy();
    expect(result.deliveries).toEqual([result.steps.deliver.delivery]);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        descriptor: { kind: "application", platform: "windows", container: "directory" },
        stepId: "build",
        artifact: "output",
        path: "/tmp/game",
      }),
    ]);
  });

  it("resolves artifact inputs to runtime paths before executing a task", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: {
            output: {
              descriptor: { kind: "application", platform: "web", container: "directory" },
            },
          },
        },
        {
          id: "ship",
          uses: "test:ship",
          needs: ["build"],
          artifactInputs: { "input-folder": { stepId: "build", artifact: "output" } },
        },
      ],
    } as const;
    let inputs: Record<string, unknown> | undefined;
    await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/workspace/web-build"),
        "test:ship": async (context) => {
          inputs = context.inputs;
        },
      },
    });
    expect(inputs).toEqual({ "input-folder": "/workspace/web-build" });
  });

  it("allows one produced artifact to serve multiple consumers", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "ship-a",
          uses: "test:ship",
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
        },
        {
          id: "ship-b",
          uses: "test:ship",
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
        },
      ],
    } as const;
    const paths: string[] = [];
    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/workspace/site"),
        "test:ship": async ({ inputs }) => {
          paths.push(inputs.input as string);
        },
      },
    });
    expect(paths).toEqual(["/workspace/site", "/workspace/site"]);
    expect(result.artifacts).toHaveLength(1);
  });

  it("fails clearly when an artifact was declared but not produced", async () => {
    const workflow = {
      version: 1,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "ship",
          uses: "test:ship",
          artifactInputs: { input: { stepId: "build", artifact: "output" } },
        },
      ],
    } as const;
    await expect(
      runWorkflow(workflow, {
        host,
        tasks: { "test:build": async () => undefined, "test:ship": async () => undefined },
      }),
    ).rejects.toThrow(
      'requires artifact "output" from step "build", but that artifact was not produced',
    );
  });

  it("retains the resolved artifact id when a delivery task fails", async () => {
    const workflow = {
      version: 1,
      continueOnError: true,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "deliver",
          uses: "test:deliver",
          needs: ["build"],
          delivery: {
            destinationId: "folder",
            slotId: "main",
            artifact: { stepId: "build", artifact: "output" },
          },
        },
      ],
    } as const;

    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async ({ setArtifact }) => setArtifact("output", "/tmp/game"),
        "test:deliver": async () => {
          throw new Error("upload failed");
        },
      },
    });

    expect(result.steps.deliver).toMatchObject({
      status: "failed",
      delivery: { status: "failed", error: "upload failed", artifactId: expect.any(String) },
    });
    expect(result.steps.deliver.delivery?.artifactId).not.toBe("");
    expect(result.deliveries).toEqual([result.steps.deliver.delivery]);
  });

  it("does not create a delivery result when its artifact producer fails", async () => {
    const workflow = {
      version: 1,
      continueOnError: true,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "deliver",
          uses: "test:deliver",
          needs: ["build"],
          delivery: {
            destinationId: "folder",
            slotId: "main",
            artifact: { stepId: "build", artifact: "output" },
          },
        },
      ],
    } as const;

    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async () => {
          throw new Error("build failed");
        },
        "test:deliver": async () => ({ delivered: true }),
      },
    });

    expect(result.steps.deliver).toMatchObject({ status: "skipped", blockedBy: ["build"] });
    expect(result.steps.deliver.delivery).toBeUndefined();
    expect(result.deliveries).toEqual([]);
  });

  it("does not create a delivery result when its completed producer creates no artifact", async () => {
    const workflow = {
      version: 1,
      continueOnError: true,
      steps: [
        {
          id: "build",
          uses: "test:build",
          artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
        },
        {
          id: "deliver",
          uses: "test:deliver",
          needs: ["build"],
          delivery: {
            destinationId: "folder",
            slotId: "main",
            artifact: { stepId: "build", artifact: "output" },
          },
        },
      ],
    } as const;

    const result = await runWorkflow(workflow, {
      host,
      tasks: {
        "test:build": async () => undefined,
        "test:deliver": async () => ({ delivered: true }),
      },
    });

    expect(result.steps.deliver).toMatchObject({ status: "failed" });
    expect(result.steps.deliver.delivery).toBeUndefined();
    expect(result.deliveries).toEqual([]);
  });

  it("fails before execution when an artifact input names an undeclared artifact", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "build",
              uses: "test:build",
              artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
            },
            {
              id: "ship",
              uses: "test:ship",
              artifactInputs: { input: { stepId: "build", artifact: "missing" } },
            },
          ],
        },
        { host, tasks: {} },
      ),
    ).rejects.toThrow('references undeclared artifact "missing" on workflow step "build"');
  });

  it("fails before execution when delivery names an undeclared artifact", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "build",
              uses: "test:build",
              artifacts: { output: { descriptor: { kind: "files", container: "directory" } } },
            },
            {
              id: "ship",
              uses: "test:ship",
              delivery: {
                destinationId: "folder",
                slotId: "slot",
                artifact: { stepId: "build", artifact: "missing" },
              },
            },
          ],
        },
        { host, tasks: {} },
      ),
    ).rejects.toThrow('references undeclared artifact "missing" on workflow step "build"');
  });

  it("fails before execution when delivery names an unknown step", async () => {
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            {
              id: "ship",
              uses: "test:ship",
              delivery: {
                destinationId: "folder",
                slotId: "slot",
                artifact: { stepId: "missing", artifact: "output" },
              },
            },
          ],
        },
        { host, tasks: {} },
      ),
    ).rejects.toThrow("references an unknown artifact step: missing");
  });

  it("records phase completion, explicit success, warnings, and skip reasons", async () => {
    const phases = definePhases([
      { id: "prepare", title: "Prepare" },
      { id: "cache", title: "Check cache" },
      { id: "package", title: "Package" },
    ]);
    const events: { type: string; stepId?: string; phaseId?: string }[] = [];
    const result = await runWorkflow(
      { version: 1, steps: [{ id: "build", uses: "test:build", phases }] },
      {
        host,
        tasks: {
          "test:build": async (task) => {
            const { phase } = task.withPhases(phases);
            await phase("prepare", async ({ success, warn }) => {
              warn("Using the fallback config");
              return success("Application prepared");
            });
            await phase("cache", ({ skip }) => skip("Cached dependencies"));
            return { ready: true };
          },
        },
        onEvent: (event) => events.push(event),
      },
    );

    expect(result.steps.build.phases).toMatchObject([
      {
        id: "prepare",
        status: "completed",
        message: "Application prepared",
        warnings: ["Using the fallback config"],
      },
      { id: "cache", status: "skipped", message: "Cached dependencies" },
      { id: "package", status: "not-reported" },
    ]);
    expect(events.map(({ type, phaseId }) => [type, phaseId])).toEqual([
      ["workflow.started", undefined],
      ["step.started", undefined],
      ["phase.started", "prepare"],
      ["phase.warning", "prepare"],
      ["phase.completed", "prepare"],
      ["phase.started", "cache"],
      ["phase.skipped", "cache"],
      ["phase.warning", "package"],
      ["phase.not-reported", "package"],
      ["step.completed", undefined],
      ["workflow.completed", undefined],
    ]);
  });

  it("fails a phase and marks later phases not-reached after callback exceptions", async () => {
    const phases = definePhases([
      { id: "install", title: "Install" },
      { id: "package", title: "Package" },
    ]);
    const events: { type: string; phaseId?: string }[] = [];
    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "build", uses: "test:build", phases }] },
        {
          host,
          tasks: {
            "test:build": async (task) => {
              const { phase } = task.withPhases(phases);
              await phase("install", ({ fail }) => fail("install failed"));
            },
          },
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow("install failed");

    expect(
      events
        .filter((event) => event.type.startsWith("phase."))
        .map((event) => [event.type, event.phaseId]),
    ).toEqual([
      ["phase.started", "install"],
      ["phase.failed", "install"],
      ["phase.not-reached", "package"],
    ]);
  });

  it("automatically marks thrown phase exceptions as failed", async () => {
    const phases = definePhases([{ id: "build", title: "Build" }]);
    const events: { type: string; phaseId?: string }[] = [];
    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "build-step", uses: "test:build", phases }] },
        {
          host,
          tasks: {
            "test:build": async (task) => {
              const { phase } = task.withPhases(phases);
              await phase("build", () => {
                throw new Error("compiler failed");
              });
            },
          },
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow("compiler failed");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "phase.failed", phaseId: "build" }),
    );
  });

  it("marks phases on dependency-skipped steps as not-reached", async () => {
    const phases = definePhases([{ id: "publish", title: "Publish" }]);
    const events: { type: string; phaseId?: string }[] = [];
    await expect(
      runWorkflow(
        {
          version: 1,
          steps: [
            { id: "build", uses: "test:fail" },
            { id: "publish", uses: "test:publish", needs: ["build"], phases },
          ],
        },
        {
          host,
          tasks: {
            "test:fail": async () => {
              throw new Error("build failed");
            },
            "test:publish": async () => ({ published: true }),
          },
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow("build failed");

    expect(events).toContainEqual(
      expect.objectContaining({ type: "phase.not-reached", phaseId: "publish" }),
    );
  });

  it("records completed and not-reached phases when cancellation arrives during a task", async () => {
    const controller = new AbortController();
    const phases = definePhases([
      { id: "install", title: "Install" },
      { id: "package", title: "Package" },
    ]);
    const events: { type: string; phaseId?: string }[] = [];
    await expect(
      runWorkflow(
        { version: 1, steps: [{ id: "build", uses: "test:build", phases }] },
        {
          host,
          signal: controller.signal,
          tasks: {
            "test:build": async (task) => {
              const { phase } = task.withPhases(phases);
              await phase("install", ({ success }) => {
                controller.abort();
                return success("Dependencies installed");
              });
            },
          },
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(events).toContainEqual(
      expect.objectContaining({ type: "phase.completed", phaseId: "install" }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "phase.not-reached", phaseId: "package" }),
    );
  });

  it("reports duplicate invocation without suppressing the second callback", async () => {
    const phases = definePhases([{ id: "install", title: "Install" }]);
    const events: { type: string; diagnostic?: boolean }[] = [];
    let calls = 0;
    const result = await runWorkflow(
      { version: 1, steps: [{ id: "build", uses: "test:build", phases }] },
      {
        host,
        tasks: {
          "test:build": async (task) => {
            const { phase } = task.withPhases(phases);
            await phase("install", () => {
              calls += 1;
            });
            await phase("install", () => {
              calls += 1;
            });
          },
        },
        onEvent: (event) => events.push(event),
      },
    );

    expect(result.steps.build.status).toBe("completed");
    expect(result.steps.build.phases?.[0]).toMatchObject({
      status: "completed",
      warnings: ["Phase 'install' was invoked more than once."],
    });
    expect(calls).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "phase.warning", diagnostic: true }),
    );
  });

  it("reports a mismatched bound catalog while still running provider work", async () => {
    const compiled = definePhases([{ id: "install", title: "Install" }]);
    const bound = definePhases([{ id: "setup", title: "Setup" }]);
    let callbackRan = false;
    const result = await runWorkflow(
      { version: 1, steps: [{ id: "build", uses: "test:build", phases: compiled }] },
      {
        host,
        tasks: {
          "test:build": async (task) => {
            const { phase } = task.withPhases(bound);
            await phase("setup", () => {
              callbackRan = true;
            });
          },
        },
      },
    );

    expect(callbackRan).toBe(true);
    expect(result.steps.build.status).toBe("completed");
    expect(result.steps.build.phases?.[0].status).toBe("not-reported");
    expect(result.steps.build.diagnostics).toContain(
      "Phase 'setup' is not declared on compiled workflow step build.",
    );
  });

  it("diagnoses a bound catalog whose phases are reordered", async () => {
    const compiled = definePhases([
      { id: "install", title: "Install" },
      { id: "package", title: "Package" },
    ]);
    const bound = definePhases([
      { id: "package", title: "Package" },
      { id: "install", title: "Install" },
    ]);
    const result = await runWorkflow(
      { version: 1, steps: [{ id: "build", uses: "test:build", phases: compiled }] },
      {
        host,
        tasks: {
          "test:build": async (task) => {
            task.withPhases(bound);
          },
        },
      },
    );

    expect(result.steps.build.diagnostics).toContain(
      "Bound phase catalog has a different order or duplicate entries than the compiled definition.",
    );
  });

  it("redacts phase skip reasons, warnings, and errors", async () => {
    const secret = "phase-token-secret";
    const phases = definePhases([{ id: "install", title: "Install" }]);
    const events: unknown[] = [];
    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          {
            id: "skip",
            uses: "test:build",
            with: { secret: "${{ env.PHASE_SECRET }}" },
            phases,
            needs: [],
          },
          {
            id: "fail",
            uses: "test:build",
            with: { secret: "${{ env.PHASE_SECRET }}" },
            phases,
            needs: [],
          },
        ],
      },
      {
        host,
        env: { PHASE_SECRET: secret },
        tasks: {
          "test:build": async (task) => {
            const { phase } = task.withPhases(phases);
            await phase("install", ({ skip, warn }) => {
              const secretValue = String(task.inputs.secret);
              warn(secretValue);
              if (task.step.id === "skip") return skip(secretValue);
              throw new Error(secretValue);
            });
          },
        },
        onEvent: (event) => events.push(event),
      },
    ).catch((error: unknown) => error);

    expect(JSON.stringify({ result, events })).not.toContain(secret);
    expect(JSON.stringify({ result, events })).toContain("[REDACTED]");
  });

  it("keeps same phase IDs isolated across concurrent workflow steps", async () => {
    const phases = definePhases([{ id: "package", title: "Package" }]);
    const result = await runWorkflow(
      {
        version: 1,
        steps: [
          { id: "target-a", uses: "test:build", phases, needs: [] },
          { id: "target-b", uses: "test:build", phases, needs: [] },
        ],
      },
      {
        host,
        tasks: {
          "test:build": async (task) => {
            const { phase } = task.withPhases(phases);
            await phase("package", async () => undefined);
          },
        },
      },
    );

    expect(result.steps["target-a"].phases?.[0].status).toBe("completed");
    expect(result.steps["target-b"].phases?.[0].status).toBe("completed");
  });

  it("rejects malformed phase definitions before running tasks", async () => {
    const task = async () => ({ ran: true });
    const invalidCatalogs = [
      {
        phases: [
          { id: "install", title: "Install" },
          { id: "install", title: "Duplicate" },
        ],
        error: "duplicate phase id: install",
      },
      {
        phases: [{ id: "", title: "Missing id" }],
        error: "phase 1 must have a non-empty id and title",
      },
      {
        phases: [{ id: "install", title: " " }],
        error: "phase 1 must have a non-empty id and title",
      },
    ];

    for (const { phases, error } of invalidCatalogs) {
      await expect(
        runWorkflow(
          {
            version: 1,
            steps: [{ id: "build", uses: "test:build", phases }],
          },
          { host, tasks: { "test:build": task } },
        ),
      ).rejects.toThrow(error);
    }
  });
});
