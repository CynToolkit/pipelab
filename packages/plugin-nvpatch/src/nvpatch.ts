import {
  createAction,
  createActionRunner,
  createPathParam,
  runWithLiveLogs,
} from "@pipelab/plugin-core";
import { ensureNVPatch } from "./ensure.js";

export const ID = "nvpatch";

export const NVPatch = createAction({
  id: ID,
  name: "Patch binary",
  description: "",
  icon: "",
  displayString: "`Patch binary ${fmt.param(params['input'], 'primary')}`",
  meta: {},
  params: {
    input: createPathParam("", {
      required: true,
      label: "File to patch",
      control: {
        type: "path",
        options: {
          properties: ["openFile"],
        },
      },
    }),
  },
  outputs: {},
});

export const NVPatchRunner = createActionRunner<typeof NVPatch>(
  async ({ log, inputs, paths, abortSignal, cwd }) => {
    const { execa } = await import("execa");
    const semver = (await import("semver")).default;

    const checkDotnetVersion = async (command: string) => {
      try {
        const { stdout } = await execa(command, ["--version"]);
        const version = stdout.trim();
        log(`.NET version found: ${version}`);
        if (semver.lt(semver.coerce(version) || "0.0.0", "8.0.0")) {
          throw new Error(`.NET version 8 or higher is required. Found version ${version}.`);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message?.includes(".NET version 8 or higher is required")) {
          throw e;
        }
        throw new Error(
          `.NET runtime not found (command: "${command}"). Please ensure .NET 8 or higher is installed.`,
        );
      }
    };

    // run

    log("Ensuring nvpatch is installed...");
    const { thirdparty } = paths;
    const nvpatchCommand = await ensureNVPatch(thirdparty);

    // Detect platform and set up platform-specific configuration
    const isMacOS = process.platform === "darwin";

    if (isMacOS) {
      // macOS: Use arch -x86_64 with dotnet runtime if needed, 
      // but let's try the direct command first as ensureNVPatch should provide a working shim
      log("Using nvpatch from", nvpatchCommand);
      
      // Still need to check dotnet as it's a dependency of the tool
      await checkDotnetVersion("dotnet");
    } else {
      log("Using nvpatch from", nvpatchCommand);
      // ensure dotnet runtime is installed
      await checkDotnetVersion("dotnet");
    }

    await runWithLiveLogs(
      nvpatchCommand,
      ["--enable", inputs["input"]],
      {
        cancelSignal: abortSignal,
      },
      log,
    );
    log("nvpatch done");
  },
);
