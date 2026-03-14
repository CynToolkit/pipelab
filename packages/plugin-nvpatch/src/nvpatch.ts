import {
  createAction,
  createActionRunner,
  createPathParam,
  runWithLiveLogs,
} from "@pipelab/plugin-core";

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
    const { join, resolve } = await import("node:path");
    const { fileExists } = await import("@pipelab/plugin-core");
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

    console.log("process.env", process.env);

    // Detect platform and set up platform-specific configuration
    const isMacOS = process.platform === "darwin";
    const isWindows = process.platform === "win32";

    let nvpatchCommand: string;
    let nvpatchArgs: string[];

    if (isMacOS) {
      // macOS: Use arch -x86_64 with dotnet runtime and DLL path
      const dotnetRuntime = "/usr/local/share/dotnet/x64/dotnet";
      const nvpatchDll = resolve(join(process.env.HOME!, ".dotnet", "tools", "nvpatch.dll"));

      log("Trying nvpatch from", nvpatchDll);

      // ensure dotnet runtime is installed
      await checkDotnetVersion(dotnetRuntime);

      nvpatchCommand = "arch";
      nvpatchArgs = ["-x86_64", dotnetRuntime, nvpatchDll, "--enable", inputs["input"]];
    } else {
      // Windows: Use direct executable path with HOME instead of USERPROFILE
      const nvpatchExe = resolve(
        join(process.env.USERPROFILE || process.env.HOME || "", ".dotnet", "tools", "nvpatch.exe"),
      );

      log("Trying nvpatch from", nvpatchExe);

      nvpatchCommand = nvpatchExe;
      nvpatchArgs = ["--enable", inputs["input"]];

      // ensure the binary exists
      if (!(await fileExists(nvpatchExe))) {
        throw new Error(`nvpatch.exe not found at ${nvpatchExe}`);
      }

      // ensure dotnet runtime is installed
      await checkDotnetVersion("dotnet");
    }

    await runWithLiveLogs(
      nvpatchCommand,
      nvpatchArgs,
      {
        cancelSignal: abortSignal,
      },
      log,
    );
    log("nvpatch done");
  },
);
