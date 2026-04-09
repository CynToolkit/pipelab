import { supabase, useLogger, isSupabaseAvailable } from "@pipelab/shared";
import { useAPI } from "../ipc-core";
import { JsonFileStorage } from "../utils/storage";
import { userDataPath } from "../context";

/**
 * Registers authentication handlers for the CLI/system backend.
 */
export const registerAuthHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  const supabaseAvailable = isSupabaseAvailable();
  if (!supabaseAvailable) {
    logger().warn("[Auth] Supabase is not available. Auth handlers will not be functional.");
    return;
  }

  // Initialize the singleton Supabase client for the backend with the custom FileStorage
  const client = supabase({
    auth: {
      storage: new JsonFileStorage("auth-session.json", userDataPath),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  handle("auth:getUser", async (_, { send }) => {
    try {
      const { data, error } = await client.auth.getUser();
      if (error) {
        return send({ type: "end", data: { type: "success", result: { user: null } } });
      }
      return send({ type: "end", data: { type: "success", result: { user: data.user } } });
    } catch (e) {
      return send({ type: "end", data: { type: "success", result: { user: null } } });
    }
  });

  handle("auth:signInWithPassword", async (_, { value, send }) => {
    const { email, password } = value;
    logger().info("[Auth] signInWithPassword:", email);
    const result = await client.auth.signInWithPassword({ email, password });
    return send({ type: "end", data: { type: "success", result: result as any } });
  });

  handle("auth:signUp", async (_, { value, send }) => {
    const { email, password } = value;
    logger().info("[Auth] signUp:", email);
    const result = await client.auth.signUp({ email, password });
    return send({ type: "end", data: { type: "success", result: result as any } });
  });

  handle("auth:signOut", async (_, { send }) => {
    logger().info("[Auth] signOut");
    await client.auth.signOut();
    return send({ type: "end", data: { type: "success", result: undefined } });
  });

  handle("auth:resetPasswordForEmail", async (_, { value, send }) => {
    const { email } = value;
    logger().info("[Auth] resetPasswordForEmail:", email);
    const { error } = await client.auth.resetPasswordForEmail(email);
    return send({ type: "end", data: { type: "success", result: { error } } });
  });

  handle("auth:invoke", async (_, { value, send }) => {
    const { name, options } = value;
    logger().info("[Auth] invoke function:", name);
    try {
      const result = await client.functions.invoke(name, options);
      return send({ type: "end", data: { type: "success", result } });
    } catch (e) {
      return send({
        type: "end",
        data: {
          type: "error",
          ipcError: e instanceof Error ? e.message : "Edge Function invocation failed",
        },
      });
    }
  });

  // Maintain logs for the backend state change and broadcast to all clients
  client.auth.onAuthStateChange(async (event, session) => {
    const { webSocketServer } = await import("../websocket-server");
    logger().info(
      "[Auth] State changed, broadcasting:",
      event,
      session?.user?.email || "anonymous",
    );
    webSocketServer.broadcast("auth:getUser" as any, { user: session?.user || null } as any);
  });
};
