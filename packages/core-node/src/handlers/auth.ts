import { supabase, useLogger, isSupabaseAvailable } from "@pipelab/shared";
import { useAPI } from "../ipc-core";
import fs from "node:fs";
import path from "node:path";
import { userDataPath } from "../context";

/**
 * A simple file-based storage implementation for Supabase Auth in Node.js.
 * This ensures that the authentication session persists across CLI restarts.
 */
class FileStorage {
  private filePath: string;

  constructor() {
    this.filePath = path.join(userDataPath, "auth-session.json");
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        // ignore errors during directory creation
      }
    }
  }

  getItem(key: string): string | null {
    try {
      if (!fs.existsSync(this.filePath)) return null;
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return data[key] || null;
    } catch (e) {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      let data: any = {};
      if (fs.existsSync(this.filePath)) {
        data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
      data[key] = value;
      fs.writeFileSync(this.filePath, JSON.stringify(data), "utf8");
    } catch (e) {
      // ignore write errors
    }
  }

  removeItem(key: string): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      delete data[key];
      fs.writeFileSync(this.filePath, JSON.stringify(data), "utf8");
    } catch (e) {
      // ignore delete errors
    }
  }
}

/**
 * Registers authentication handlers for the CLI/system backend.
 */
export const registerAuthHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  if (!isSupabaseAvailable) {
    logger().warn("[Auth] Supabase is not available. Auth handlers will not be functional.");
    return;
  }

  // Initialize the singleton Supabase client for the backend with the custom FileStorage
  const client = supabase({
    auth: {
      storage: new FileStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  handle("auth:getUser", async (_, { send }) => {
    logger().debug("[Auth] auth:getUser");
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
    const { webSocketServer } = await import("../websocket-server.js");
    logger().info("[Auth] State changed, broadcasting:", event, session?.user?.email || "anonymous");
    webSocketServer.broadcast("auth:getUser" as any, { user: session?.user || null } as any);
  });
};
