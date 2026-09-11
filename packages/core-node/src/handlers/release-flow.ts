import { mkdir, rm, stat } from "node:fs/promises";
import process from "node:process";
import { useAPI, HandleListenerSendFn } from "../ipc-core";
import { PipelabContext, CacheFolder } from "../context";
import { setupConnectionsConfigFile, setupReleaseFlowConfigFileByName } from "../config";
import { handleActionExecute } from "../handler-func";
import type { ReleaseFlow } from "@pipelab/shared";

type DestinationResult = { status: "completed" | "failed"; error?: string };

const hostPlatform =
  process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
const hostArch = process.arch === "arm64" ? "arm64" : "x64";

export const registerReleaseFlowHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  let abortController: AbortController | undefined;

  handle("release-flow:cancel", async (_, { send }) => {
    abortController?.abort();
    send({ type: "end", data: { type: "success", result: { result: "ok" } } });
  });

  handle("release-flow:execute", async (_, { send, value }) => {
    const flowManager = await setupReleaseFlowConfigFileByName(value.name, context);
    const flow = await flowManager.getConfig();
    const continueOnError = flow.continueOnError ?? true;
    const connections = await (await setupConnectionsConfigFile(context)).getConfig();
    const connectionById = new Map(
      connections.connections.map((connection: any) => [connection.id, connection]),
    );
    const results: Record<string, DestinationResult> = {};
    abortController = new AbortController();

    const emit = (event: any) => send(event);
    const log = (message: string) =>
      emit({ type: "release-log", data: { message, time: Date.now() } });
    const action = async (
      pluginId: string,
      nodeId: string,
      params: Record<string, string>,
      cwd: string,
    ) => {
      const actionSend: HandleListenerSendFn<"action:execute"> = async (event: any) => {
        if (event.type === "log") {
          const message = event.data.message.map(String).join(" ");
          log(message);
        }
      };
      const result = await handleActionExecute(
        nodeId,
        pluginId,
        params,
        undefined,
        actionSend,
        abortController!.signal,
        cwd,
        context.getCachePath(CacheFolder.Pipelines, "release-flows", flow.id),
        context,
      );
      if (result.type === "error") throw new Error(result.ipcError);
      return result.result.outputs as Record<string, string>;
    };

    let workspace = "";
    try {
      if (!flow.source.path) throw new Error("Choose a source before shipping");
      const sourceStats = await stat(flow.source.path);
      if (!sourceStats.isDirectory() && flow.source.type === "folder")
        throw new Error("The build folder does not exist");
      if (flow.source.type === "construct3" && !sourceStats.isFile())
        throw new Error("The Construct project file does not exist");

      const selected = flow.destinations.filter(
        (destination) => !value.destinations || value.destinations.includes(destination.type),
      );
      if (!selected.length) throw new Error("Choose at least one destination");
      const steam = selected.find((destination) => destination.type === "steam");
      const webDestinations = selected.filter(
        (destination) => destination.type === "web" || destination.type === "itch",
      );

      workspace = await context.createTempFolder("release-flow-");
      const webBuild = `${workspace}/web`;
      await mkdir(webBuild, { recursive: true });

      let webSource = flow.source.path;
      if (flow.source.type === "construct3") {
        const profile = flow.source.profileConnectionId
          ? (connectionById.get(flow.source.profileConnectionId) as any)
          : undefined;
        const exported = await action(
          "@pipelab/plugin-construct",
          "export-construct-project",
          {
            file: flow.source.path,
            username: "",
            password: "",
            version: flow.source.version || "",
            headless: "false",
            timeout: "120",
            customProfile: profile?.path || "",
          },
          `${workspace}/export`,
        );
        await action(
          "@pipelab/plugin-filesystem",
          "unzip-file-node",
          { file: String(exported.zipFile || exported.folder) },
          webBuild,
        );
        webSource = webBuild;
      }

      for (const destination of webDestinations) {
        const key = destination.type;
        emit({ type: "release-destination", data: { type: key, status: "running" } });
        try {
          if (destination.type === "web") {
            await action(
              "@pipelab/plugin-filesystem",
              "fs:copy",
              {
                from: webSource,
                to: destination.outputDir,
                recursive: "true",
                overwrite: String(destination.overwrite ?? false),
                cleanup: String(destination.cleanup ?? false),
              },
              `${workspace}/copy-${key}`,
            );
          } else {
            const account = connectionById.get(destination.accountConnectionId) as any;
            if (!account?.apiKey)
              throw new Error("The selected Itch.io connection has no Butler API key");
            await action(
              "@pipelab/plugin-itch",
              "itch-upload",
              {
                "input-folder": webSource,
                user: destination.user,
                project: destination.project,
                channel: destination.channel,
                "api-key": account.apiKey,
              },
              `${workspace}/itch`,
            );
          }
          results[key] = { status: "completed" };
          emit({ type: "release-destination", data: { type: key, status: "completed" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results[key] = { status: "failed", error: message };
          emit({
            type: "release-destination",
            data: { type: key, status: "failed", error: message },
          });
          if (!continueOnError) break;
        }
      }

      if (
        steam &&
        (continueOnError || !Object.values(results).some((result) => result.status === "failed"))
      ) {
        const sdk = connectionById.get(steam.sdkConnectionId || "") as any;
        const account = connectionById.get(steam.accountConnectionId || "") as any;
        if (!sdk?.path || !account?.email)
          throw new Error("Select a Steam SDK and account connection before shipping");
        emit({ type: "release-destination", data: { type: "steam", status: "running" } });
        try {
          const packaged = await action(
            "@pipelab/plugin-electron",
            "electron:package:v2",
            {
              platform: hostPlatform,
              arch: hostArch,
              "input-folder": webSource,
              configuration: "{}",
              name: steam.appName,
              appBundleId: steam.appBundleId,
              appVersion: steam.appVersion,
              author: "Pipelab",
              description: steam.description,
              icon: steam.icon || "",
            },
            `${workspace}/electron`,
          );
          await action(
            "@pipelab/plugin-steam",
            "steam-upload",
            {
              sdk: sdk.path,
              username: account.email,
              appId: steam.appId,
              depotId: steam.depotId,
              description: steam.description,
              folder: String(packaged.output),
            },
            `${workspace}/steam`,
          );
          results.steam = { status: "completed" };
          emit({ type: "release-destination", data: { type: "steam", status: "completed" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.steam = { status: "failed", error: message };
          emit({
            type: "release-destination",
            data: { type: "steam", status: "failed", error: message },
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(message);
      if (abortController.signal.aborted) {
        send({
          type: "end",
          data: { type: "error", code: "canceled", ipcError: "Release canceled" },
        });
        return;
      }
      send({ type: "end", data: { type: "error", ipcError: message } });
      return;
    } finally {
      abortController = undefined;
      if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});
    }

    send({ type: "end", data: { type: "success", result: { destinations: results } } });
  });
};
