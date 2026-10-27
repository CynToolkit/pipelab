import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const state = vi.hoisted(() => ({
  user: null as null | { email: string; is_anonymous: false },
  factory: vi.fn(),
  prompts: {
    text: vi.fn(async () => " cloud@example.com "),
    password: vi.fn(async () => "not-a-real-password"),
    isCancel: vi.fn(() => false),
  },
  auth: {
    signInWithPassword: vi.fn(async () => {
      state.user = { email: "cloud@example.com", is_anonymous: false };
      return {
        data: { session: { access_token: "cloud-session-token" }, user: state.user },
        error: null,
      };
    }),
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    signOut: vi.fn(async () => {
      state.user = null;
      return { error: null };
    }),
  },
}));

vi.mock("@clack/prompts", () => state.prompts);
vi.mock("@pipelab/core-node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/core-node")>();
  return {
    ...actual,
    createPipelabCloudAuthClient: state.factory,
  };
});
vi.mock("@pipelab/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pipelab/providers")>();
  return {
    ...actual,
    loginToPoki: vi.fn(),
    loginToSteam: vi.fn(),
  };
});

import { registerSettingsCommands } from "../../../src/commands/settings";

const originalExitCode = process.exitCode;
const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

const setInteractive = (interactive: boolean) => {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: interactive });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: interactive });
};

const restoreTTY = () => {
  if (originalStdinTty) Object.defineProperty(process.stdin, "isTTY", originalStdinTty);
  else Reflect.deleteProperty(process.stdin, "isTTY");
  if (originalStdoutTty) Object.defineProperty(process.stdout, "isTTY", originalStdoutTty);
  else Reflect.deleteProperty(process.stdout, "isTTY");
};

const parseSettings = async (...args: string[]) => {
  const program = new Command().exitOverride();
  registerSettingsCommands(program);
  await program.parseAsync(["node", "pipelab", ...args]);
};

afterEach(() => {
  vi.restoreAllMocks();
  state.user = null;
  state.factory.mockReset();
  state.factory.mockReturnValue({ auth: state.auth });
  state.prompts.text.mockReset();
  state.prompts.text.mockResolvedValue(" cloud@example.com ");
  state.prompts.password.mockReset();
  state.prompts.password.mockResolvedValue("not-a-real-password");
  state.prompts.isCancel.mockReset();
  state.prompts.isCancel.mockReturnValue(false);
  state.auth.signInWithPassword.mockReset();
  state.auth.signInWithPassword.mockImplementation(async () => {
    state.user = { email: "cloud@example.com", is_anonymous: false };
    return {
      data: { session: { access_token: "cloud-session-token" }, user: state.user },
      error: null,
    };
  });
  state.auth.getUser.mockReset();
  state.auth.getUser.mockImplementation(async () => ({ data: { user: state.user }, error: null }));
  state.auth.signOut.mockReset();
  state.auth.signOut.mockImplementation(async () => {
    state.user = null;
    return { error: null };
  });
  restoreTTY();
  process.exitCode = originalExitCode;
});

describe("Pipelab Cloud CLI authentication commands", () => {
  it("signs in interactively, reports the saved session, and signs out locally", async () => {
    setInteractive(true);
    state.factory.mockReturnValue({ auth: state.auth });
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await parseSettings("settings", "cloud", "login", "--user-data", "/tmp/pipelab-user-data");

    expect(state.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "cloud@example.com",
      password: "not-a-real-password",
    });
    expect(output.mock.calls.flat().join(" ")).toContain("Signed in to Pipelab Cloud");
    expect(output.mock.calls.flat().join(" ")).not.toContain("cloud-session-token");

    await parseSettings("settings", "cloud", "status", "--user-data", "/tmp/pipelab-user-data");
    expect(output.mock.calls.flat().join(" ")).toContain("cloud@example.com");

    await parseSettings("settings", "cloud", "logout", "--user-data", "/tmp/pipelab-user-data");
    expect(state.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(state.user).toBeNull();

    await parseSettings("settings", "cloud", "status", "--user-data", "/tmp/pipelab-user-data");
    expect(output.mock.calls.flat().join(" ")).toContain("Not signed in to Pipelab Cloud");
  });

  it("rejects a noninteractive login before creating an auth session", async () => {
    setInteractive(false);
    state.factory.mockReturnValue({ auth: state.auth });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await parseSettings("settings", "cloud", "login", "--user-data", "/tmp/pipelab-user-data");

    expect(state.factory).not.toHaveBeenCalled();
    expect(state.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(" ")).toContain("needs an interactive terminal");
    expect(error.mock.calls.flat().join(" ")).toContain("CI authentication is not available");
    expect(process.exitCode).toBe(1);
  });
});
