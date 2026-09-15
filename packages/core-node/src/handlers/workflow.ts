import { createLocalHost, runWorkflow, type WorkflowRunContext } from "@pipelab/workflow-runtime";
import { nanoid } from "nanoid";
import { mkdir } from "node:fs/promises";
import { useLogger } from "@pipelab/shared";
import { CacheFolder, PipelabContext } from "../context";
import { ensureNodeJS, ensurePNPM } from "../utils/remote";
import { createPipelabWorkflowTasks } from "../workflow-tasks";
import { useAPI } from "../ipc-core";

export const registerWorkflowHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  let abortController: AbortController | undefined;

  handle("workflow:execute", async (_, { send, value }) => {
    const controller = new AbortController();
    abortController = controller;
    const buildId = nanoid();
    const workspaceRoot = context.getArtifactsPath("workflow", buildId);

    try {
      await mkdir(workspaceRoot, { recursive: true });
      const node = await ensureNodeJS(context);
      const pnpm = await ensurePNPM(context);
      const tasks = createPipelabWorkflowTasks({
        context,
        paths: {
          cache: context.getCachePath(
            CacheFolder.Pipelines,
            value.pipelineId ?? "workflow",
            buildId,
          ),
          pnpm,
          node,
          userData: context.userDataPath,
          modules: context.getPackagesPath(),
          thirdparty: context.getThirdPartyPath(),
        },
      });
      const host = createLocalHost(workspaceRoot, {
        logger: {
          info: (...args) => logger().info(...args),
          warn: (...args) => logger().warn(...args),
          error: (...args) => logger().error(...args),
        },
      });

      const runContext: WorkflowRunContext = {
        host,
        variables: value.variables,
        signal: controller.signal,
        tasks,
        onEvent: (event) => {
          void send({ type: "workflow-event", data: event });
        },
      };
      const result = await runWorkflow(value.workflow, runContext);

      await send({
        type: "end",
        data: {
          type: "success",
          result: { result, buildId },
        },
      });
    } catch (error) {
      const isCancelled =
        controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      logger().error("Workflow execution failed:", error);
      await send({
        type: "end",
        data: {
          type: "error",
          code: isCancelled ? "canceled" : "error",
          ipcError: error instanceof Error ? error.message : "Unknown error",
        },
      });
    } finally {
      if (abortController === controller) abortController = undefined;
    }
  });

  handle("workflow:cancel", async (_, { send }) => {
    abortController?.abort("Interrupted by user");
    await send({
      type: "end",
      data: {
        type: "success",
        result: { result: "ok" },
      },
    });
  });
};
