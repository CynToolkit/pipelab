import { End } from "@pipelab/shared";
import {
  Action,
  ActionRunner,
  Condition,
  ConditionRunner,
  InputsDefinition,
} from "@pipelab/plugin-core";
import { usePlugins } from "@pipelab/shared";
import { isRequired } from "@pipelab/shared";
import { mkdir, stat } from "node:fs/promises";
import { assetsPath, isDev, userDataPath } from "./context";
import { useLogger } from "@pipelab/shared";
import { BlockCondition } from "@pipelab/shared";
import { HandleListenerSendFn } from "./handlers";
import { ensureNodeJS, ensurePNPM } from "./utils";
import { generateTempFolder } from "@pipelab/plugin-core";
import path from "node:path";
import os from "node:os";
const { join } = path;
const { tmpdir } = os;
import { setupConfigFile } from "./config";
import { AppConfig } from "@pipelab/shared";
import { fetchPipelabAsset, fetchPipelabPlugin } from "./utils/remote";

const checkParams = (definitionParams: InputsDefinition, elementParams: Record<string, string>) => {
  // get a list of all required params
  let expected = Object.keys(definitionParams);

  const found: string[] = [];
  // for each param in elementParams
  for (const param of Object.keys(elementParams)) {
    // if the param is in the expected list
    if (expected.includes(param)) {
      // add to found
      found.push(param);
      // remove from expected
      expected = expected.filter((x) => x !== param);
    } else {
      // throw new Error('Unexpected param "' + param + '"')
      console.warn('Unexpected param "' + param + '"');
    }
  }

  for (const param of expected) {
    if (isRequired(definitionParams[param])) {
      throw new Error('Missing param "' + param + '"');
    }
  }
};

export const handleConditionExecute = async (
  nodeId: string,
  pluginId: string,
  params: BlockCondition["params"],
  cwd: string,
): Promise<End<"condition:execute">> => {
  const { plugins } = usePlugins();
  const { logger } = useLogger();

  const node = plugins.value
    .find((plugin) => plugin.id === pluginId)
    ?.nodes.find((node: any) => node.node.id === nodeId) as
    | {
        node: Condition;
        runner: ConditionRunner<any>;
      }
    | undefined;

  if (!node) {
    return {
      type: "error",
      ipcError: "Node not found",
    };
  }

  try {
    const s = await stat(cwd);
    if (!s.isDirectory()) {
      throw new Error(`Execution directory "${cwd}" exists but is not a directory.`);
    }
  } catch (e: any) {
    if (e.code === "ENOENT") {
      await mkdir(cwd, { recursive: true });
    } else {
      throw e;
    }
  }

  try {
    checkParams(node.node.params, params);
    const resolvedInputs = params; // await resolveConditionInputs(params, node.node, steps)

    const result = await node.runner({
      inputs: resolvedInputs,
      log: (...args) => {
        logger().info(`[${node.node.name}]`, ...args);
      },
      meta: {
        definition: "",
      },
      setMeta: () => {
        logger().info("set meta defined here");
      },
      cwd,
    });

    return {
      type: "success",
      result: {
        outputs: {},
        value: result,
      },
    };
  } catch (e) {
    logger().error("Error in condition execution:", e);
    return {
      type: "error",
      ipcError: String(e),
    };
  }
};

export const handleActionExecute = async (
  nodeId: string,
  pluginId: string,
  params: Record<string, string>,
  mainWindow: any | undefined,
  send: HandleListenerSendFn<"action:execute">,
  abortSignal: AbortSignal,
  cwd: string,
  cachePath: string,
): Promise<End<"action:execute">> => {
  const { plugins } = usePlugins();
  const { logger } = useLogger();

  mainWindow?.setProgressBar(1, {
    mode: "indeterminate",
  });

  const node = plugins.value
    .find((plugin) => plugin.id === pluginId)
    ?.nodes.find((node: any) => node.node.id === nodeId) as
    | {
        node: Action;
        runner: ActionRunner<any>;
      }
    | undefined;

  if (!node) {
    mainWindow?.setProgressBar(1, { mode: "normal" });
    return {
      type: "error",
      ipcError: "Node not found",
    };
  }

  const nodePath = await ensureNodeJS("24.14.1");
  const pnpm = await ensurePNPM("10.12.0");

  const outputs: Record<string, unknown> = {};
  const api: any = {
    fetchAsset: async (packageName: string, versionOrRange?: string) => {
      return fetchPipelabAsset(packageName, versionOrRange);
    },
    fetchPlugin: async (pluginName: string, versionOrRange?: string) => {
      return fetchPipelabPlugin(pluginName, versionOrRange);
    },
  };

  try {
    try {
      const s = await stat(cwd);
      if (!s.isDirectory()) {
        throw new Error(`Execution directory "${cwd}" exists but is not a directory.`);
      }
    } catch (e: any) {
      if (e.code === "ENOENT") {
        await mkdir(cwd, { recursive: true });
      } else {
        throw e;
      }
    }
    checkParams(node.node.params, params);
    const resolvedInputs = params; // await resolveActionInputs(params, node.node, steps)
    logger().info("resolvedInputs", resolvedInputs);

    await node.runner({
      inputs: resolvedInputs,
      log: (...args) => {
        const decorator = `[${node.node.name}]`;
        const logArgs = [decorator, ...args];
        logger().info(...logArgs);
        send({
          type: "log",
          data: {
            decorator,
            time: Date.now(),
            message: args,
          },
        });
      },
      setOutput: (key: any, value: unknown) => {
        outputs[key] = value;
      },
      meta: {
        definition: "",
      },
      setMeta: () => {
        logger().info("set meta defined here");
      },
      cwd: cwd,
      paths: {
        assets: assetsPath,
        cache: cachePath,
        node: nodePath,
        pnpm,
        modules: "",
        userData: userDataPath,
        thirdparty: join(userDataPath, "thirdparty"),
      },
      api,
      browserWindow: mainWindow,
      abortSignal,
    });

    mainWindow?.setProgressBar(1, { mode: "normal" });

    return {
      type: "success",
      result: { outputs, tmp: cwd },
    };
  } catch (e) {
    logger().error("Error in action execution:", e);
    mainWindow?.setProgressBar(1, { mode: "normal" });

    // If aborted, throw AbortError to distinguish from actual errors
    if (abortSignal.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    return {
      type: "error",
      ipcError: String(e),
    };
  }
};
