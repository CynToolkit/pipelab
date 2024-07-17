import { createAction, createActionRunner, runWithLiveLogs } from "@cyn/plugin-core";
import type { MakeOptions } from "@electron-forge/core";

// TODO: https://js.electronforge.io/modules/_electron_forge_core.html

export const ID = "electron:make";

export const make = createAction({
  id: ID,
  name: "Create Installer",
  description: "Create a distributable installer for your chosen platform",
  icon: "",
  displayString: "Build package",
  meta: {},
  params: {
    arch: {
      value: "" as MakeOptions["arch"],
      label: "Architecture",
      required: false,
      control: {
        type: "select",
        options: {
          placeholder: "Architecture",
          options: [
            {
              label: "Older PCs (ia32)",
              value: "ia32",
            },
            {
              label: "Modern PCs (x64)",
              value: "x64",
            },
            {
              label: "Older Mobile/Pi (armv7l)",
              value: "armv7l",
            },
            {
              label: "New Mobile/Apple Silicon (arm64)",
              value: "arm64",
            },
            {
              label: "Mac Universal (universal)",
              value: "universal",
            },
            {
              label: "Special Systems (mips64el)",
              value: "mips64el",
            },
          ],
        },
      },
    },
    platform: {
      value: "" as MakeOptions["platform"],
      label: "Platform",
      required: false,
      control: {
        type: "select",
        options: {
          placeholder: "Platform",
          options: [
            {
              label: "Windows (win32)",
              value: "win32",
            },
            {
              label: "macOS (darwin)",
              value: "darwin",
            },
            {
              label: "Linux (linux)",
              value: "linux",
            },
          ],
        },
      },
    },
    "input-folder": {
      value: "",
      label: "Input folder",
      control: {
        type: "path",
      },
    },
  },
  outputs: {
    output: {
      label: "Output",
      value: "",
      control: {
        type: "path",
      },
    },
  },
});

export const makeRunner = createActionRunner<typeof make>(
  async ({ log, inputs, cwd, setOutput }) => {
    log("building electron");

    const { join, dirname } = await import("node:path");
    const { cp } = await import("node:fs/promises");
    const { fileURLToPath } = await import("url");
    // @ts-expect-error
    const __dirname = fileURLToPath(dirname(import.meta.url));
    const { execa } = await import("execa");
    const pnpm = join(__dirname, "..", "node_modules", "pnpm", "bin", "pnpm.cjs");
    const forge = join(
      __dirname,
      "..",
      "node_modules",
      "@electron-forge",
      "cli",
      "dist",
      "electron-forge.js"
    );

    const appFolder = inputs["input-folder"];

    const destinationFolder = join(cwd, "build");

    const templateFolder = join(__dirname, "resources", "electron", "template", "app");

    await cp(templateFolder, destinationFolder, {
      recursive: true,
    });

    const placeAppFolder = join(destinationFolder, "src", "app");

    const outFolder = join(cwd, "output");

    await cp(appFolder, placeAppFolder, {
      recursive: true,
    });

    await runWithLiveLogs(pnpm, ["install"], {
      cwd: destinationFolder,
    }, log);

    try {
      // console.log({
      //   arch: inputs.arch,
      //   dir: destinationFolder,
      //   interactive: false,
      //   outDir: cwd,
      //   platform: inputs.platform,
      //   skipPackage: false,
      // });
      // const result = await api.make({
      //   arch: inputs.arch,
      //   dir: destinationFolder,
      //   interactive: false,
      //   outDir: cwd,
      //   platform: inputs.platform,
      //   skipPackage: false,
      // });

      const logs = await runWithLiveLogs(
        forge,
        [
          "make",
          "--",
          "--arch",
          inputs.arch ?? "",
          "--platform",
          inputs.platform ?? "",
        ],
        {
          cwd: destinationFolder,
          env: {
            DEBUG: 'electron-packager',
          },
        },
        log,
      );

      console.log("logs", logs);

      setOutput("output", join(destinationFolder, 'out', 'make'));
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === "RequestError") {
          console.log("Request error");
        }
        if (e.name === "RequestError") {
          console.log("Request error");
        }
      }
      console.error(e);
    }
  },
);
