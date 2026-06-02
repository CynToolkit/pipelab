import { Channels, Data, End, Events, ShellChannels } from "@pipelab/shared";
import { useLogger } from "@pipelab/shared";
import { useWebSocketAPI } from "./websocket-client";
import { WebSocketListener } from "@pipelab/shared";
import { useUIStore } from "../store/ui";

// Re-export for backwards compatibility
export type { WebSocketListener };

export const useAPI = () => {
  const { logger } = useLogger();
  const { execute: wsExecute, isConnected, on: wsOn } = useWebSocketAPI();
  const uiStore = useUIStore();

  /**
   * Send an order and wait for its execution
   */
  const execute = async <KEY extends Channels>(
    channel: KEY,
    data?: Data<KEY>,
    listener?: WebSocketListener<KEY>,
  ): Promise<End<KEY>> => {
    // If it's a shell channel and we are in Electron, use IPC
    if (ShellChannels.includes(channel)) {
      if (window.electron) {
        logger().debug("Routing to Electron IPC:", channel);
        try {
          const result = await window.electron.ipcRenderer.invoke(channel, data);
          return {
            type: "success",
            result,
          } as any;
        } catch (error: any) {
          logger().error("Shell channel IPC invoke error:", error);
          return {
            type: "error",
            ipcError: error.message,
          } as any;
        }
      } else {
        // Fallback for headless mode
        if (channel === "dialog:showOpenDialog") {
          logger().debug("Falling back to web file picker (open):", data);
          const result = await uiStore.showFilePicker({
            ...(data as any),
            mode: "open",
          });
          return {
            type: "success",
            result,
          } as any;
        } else if (channel === "dialog:showSaveDialog") {
          logger().debug("Falling back to web file picker (save):", data);
          const result = await uiStore.showFilePicker({
            ...(data as any),
            mode: "save",
          });
          return {
            type: "success",
            result,
          } as any;
        }
      }
    }

    try {
      if (channel === "graph:execute" && !window.electron && !isConnected()) {
        logger().info("Routing graph:execute to Cloud Orchestrator");
        return (await runInCloud(data as any, listener as any)) as any;
      }

      const result = await wsExecute(channel, data, listener);

      return result;
    } catch (error) {
      logger().error("API execution error:", error);
      throw error;
    }
  };

  /**
   * Transparently run a pipeline in the cloud via Supabase Edge Functions
   */
  const runInCloud = async (data: any, listener?: WebSocketListener<"graph:execute">) => {
    const { supabase: getSupabase } = await import("@pipelab/shared");
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not available for cloud execution");

    // 1. Invoke the Edge Function
    const { data: runData, error: functionError } = await supabase.functions.invoke("cloud-run", {
      body: {
        pipeline: data.graph,
        options: {
          os: "windows", // Default to windows for now as per requirements
        },
      },
    });

    if (functionError) throw functionError;
    const { runId } = runData;

    return new Promise((resolve, reject) => {
      // 2. Subscribe to logs via Supabase Realtime
      const channel = supabase
        .channel(`cloud-logs-${runId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "cloud_run_logs",
            filter: `run_id=eq.${runId}`,
          },
          (payload) => {
            const log = payload.new;
            if (log.type === "node-enter") {
              listener?.({
                type: "node-enter",
                data: { nodeUid: log.node_uid, nodeName: log.node_name || "" },
              });
            } else if (log.type === "node-exit") {
              listener?.({
                type: "node-exit",
                data: { nodeUid: log.node_uid, nodeName: log.node_name || "" },
              });
            } else if (log.type === "log") {
              listener?.({
                type: "node-log",
                data: {
                  nodeUid: log.node_uid,
                  logData: {
                    message: [log.message],
                    timestamp: new Date(log.created_at).getTime(),
                  },
                },
              });
            }
          },
        )
        .subscribe();

      // 3. Monitor run status
      const statusSubscription = supabase
        .channel(`cloud-status-${runId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "cloud_runs",
            filter: `id=eq.${runId}`,
          },
          (payload) => {
            const run = payload.new;
            if (run.status === "success") {
              statusSubscription.unsubscribe();
              channel.unsubscribe();
              resolve({ type: "success", result: {} });
            } else if (run.status === "failed") {
              statusSubscription.unsubscribe();
              channel.unsubscribe();
              resolve({ type: "error", code: "error", ipcError: "Cloud execution failed" });
            }
          },
        )
        .subscribe();
    });
  };

  /**
   * Send an order (for backwards compatibility)
   */
  const send = <KEY extends Channels>(channel: KEY, data?: Data<KEY>) => {
    logger().warn("useAPI.send() is deprecated. Use useAPI.execute() instead.");
    return execute(channel, data);
  };

  /**
   * On method (placeholder for backwards compatibility)
   */
  const on = <KEY extends Channels>(
    channel: KEY | string,
    listener: (data: Events<KEY>) => void,
  ) => {
    return wsOn(channel, listener);
  };

  return {
    send,
    on,
    execute,
    isConnected,
  };
};

export type UseAPI = ReturnType<typeof useAPI>;
