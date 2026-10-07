import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelabContext } from "../context";
import type { Events, WebSocketHandler } from "@pipelab/shared";

const { handle, invoke } = vi.hoisted(() => ({
  handle: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("../ipc-core", () => ({ useAPI: () => ({ handle }) }));
vi.mock("../utils/storage", () => ({ JsonFileStorage: vi.fn() }));
vi.mock("../websocket-server", () => ({ webSocketServer: { broadcast: vi.fn() } }));
vi.mock("@pipelab/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/shared")>();
  return {
    ...actual,
    isSupabaseAvailable: () => true,
    supabase: () => ({
      functions: { invoke },
      auth: { onAuthStateChange: vi.fn() },
    }),
    useLogger: () => ({
      logger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    }),
  };
});

import { registerAuthHandlers } from "./auth";

describe("auth:invoke error serialization", () => {
  beforeEach(() => {
    handle.mockReset();
    invoke.mockReset();
  });

  it("serializes the function error message and HTTP status without the response body", async () => {
    const functionError = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      name: "FunctionsHttpError",
      context: new Response("private response body", { status: 404 }),
    });
    invoke.mockResolvedValue({ data: null, error: functionError });
    registerAuthHandlers({} as PipelabContext);

    const registration = handle.mock.calls.find(([channel]) => channel === "auth:invoke");
    const handler = registration?.[1] as WebSocketHandler<"auth:invoke"> | undefined;
    expect(handler).toBeDefined();

    const sentEvents: Events<"auth:invoke">[] = [];
    await handler?.(
      { sender: "test" },
      {
        value: { name: "polar-user-plan" },
        send: async (events) => {
          sentEvents.push(events);
        },
      },
    );

    const serializedEvents = JSON.stringify(sentEvents[0]);
    expect(serializedEvents).toContain("Edge Function returned a non-2xx status code (HTTP 404)");
    expect(serializedEvents).toContain('"status":404');
    expect(serializedEvents).not.toContain("private response body");
  });
});
