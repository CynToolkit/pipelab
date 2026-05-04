import {
  ActionRunnerData,
  createAction,
  createPathParam,
  createStringParam,
  detectRuntime,
  InputsDefinition,
  OutputsDefinition,
  runWithLiveLogs,
  fetchPipelabAsset,
  runPnpm,
} from "@pipelab/plugin-core";
import { dirname, join, basename, delimiter } from "node:path";
import { cp, readFile, writeFile } from "node:fs/promises";
import { platform as osPlatform, arch as osArch } from "node:os";
import { kebabCase } from "change-case";
import { createServer } from "node:http";
import serve from "serve-handler";
import { startTunnel } from "untun";

export const IDPackage = "discord:package";
export const IDPreview = "discord:preview";

const paramsInputFolder = {
  "input-folder": createPathParam("", {
    label: "Folder to package",
    required: true,
    control: {
      type: "path",
      options: {
        properties: ["openDirectory"],
      },
    },
  }),
} satisfies InputsDefinition;

// const paramsInputURL = {
//   'input-url': createStringParam('', {
//     label: 'URL to preview',
//     required: true
//   })
// } satisfies InputsDefinition

export const configureParams = {
  name: createStringParam("Pipelab", {
    label: "Application name",
    description: "The name of the application",
    required: true,
  }),
} satisfies InputsDefinition;

const outputs = {
  outputDir: {
    label: "Output folder",
    value: "",
    description: "The folder where the packaged application is located",
  },
} satisfies OutputsDefinition;

export const createPackageProps = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string,
  advanced?: boolean,
  deprecated?: boolean,
  deprecatedMessage?: string,
  disabled?: false,
  updateAvailable?: boolean,
) => {
  return createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    advanced,
    deprecated,
    deprecatedMessage,
    disabled,
    updateAvailable,
    params: {
      ...paramsInputFolder,
      ...configureParams,
    },
    outputs: {
      outputDir: outputs.outputDir,
    },
  });
};

export const createPreviewProps = (
  id: string,
  name: string,
  description: string,
  icon: string,
  displayString: string,
) =>
  createAction({
    id,
    name,
    description,
    icon,
    displayString,
    meta: {},
    params: {
      ...paramsInputFolder,
      ...configureParams,
      customHostname: createStringParam("", {
        required: false,
        label: "Custom hostname",
        description: "The hostname to use for the preview",
      }),
    },
    outputs: {
      // ...outputs.outputDir
    },
  });

const createAppServer = async (folder: string) => {
  try {
    const server = createServer();

    server.on("request", (req, res) => {
      return serve(req, res, {
        maxAge: 0,
        public: folder,
        headers: {
          "bypass-tunnel-reminder": "false",
        },
      });
    });

    const listen = async () => {
      return new Promise((resolve, reject) => {
        server.listen(40400, "127.0.0.1", () => {
          return resolve(server);
        });
      });
    };

    await listen();
    console.log("listening2");
    console.log("address", server.address);
    const addressRes = server.address();
    console.log("addressRes", addressRes);
    if (addressRes && typeof addressRes !== "string") {
      return { port: addressRes.port };
    }
    throw new Error("Unable to bind server: adress is not an object");
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const waitForAbort = (signal: AbortSignal): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      return resolve(); // Already aborted
    }

    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort);
  });
};

export const discord = async (
  action: "package" | "preview",
  appFolder: string | undefined,
  {
    cwd,
    log,
    inputs,
    setOutput,
    paths,
    abortSignal,
    context,
  }:
    | ActionRunnerData<ReturnType<typeof createPackageProps>>
    | ActionRunnerData<ReturnType<typeof createPreviewProps>>,
  completeConfiguration: DesktopApp.Config,
): Promise<{ folder: string; binary: string | undefined } | undefined> => {
  console.log("appFolder", appFolder);

  log("Building discord");

  const runtime = await detectRuntime(appFolder);

  const { modules, cache, node } = paths;

  const destinationFolder = join(cwd, "build");

  const rawAssetFolder = await fetchPipelabAsset("@pipelab/asset-discord", "^1.0.0", { context });
  const templateFolder = join(rawAssetFolder, "template");

  // copy template to destination
  await cp(templateFolder, destinationFolder, {
    recursive: true,
    filter: (src) => {
      log("src", src);
      // log('dest', dest)
      // TODO: support other oses
      return (
        basename(src) !== "node_modules" &&
        !src.includes(".nitro") &&
        !src.includes(".output") &&
        !src.includes(".env")
      );
    },
  });

  const placeAppFolder = join(destinationFolder, "src", "app");

  // if input is folder, copy folder to destination
  if (appFolder) {
    // copy app to template
    await cp(appFolder, placeAppFolder, { recursive: true });
  }

  writeFile(
    join(destinationFolder, ".env"),
    `DISCORD_CLIENT_ID=1357217738241736724
DISCORD_CLIENT_SECRET=yJ4vRnzDtKAqg2Le3_Sap2CqHybkTp2U`,
    "utf8",
  );

  const sanitizedName = kebabCase(completeConfiguration.name);

  // package.json update
  // const pkgJSONPath = join(destinationFolder, 'package.json')
  // const pkgJSONContent = await readFile(pkgJSONPath, 'utf8')
  // const pkgJSON = JSON.parse(pkgJSONContent)
  // log('Setting name to', sanitizedName)
  // pkgJSON.name = sanitizedName
  // log('Setting productName to', completeConfiguration.name)
  // pkgJSON.productName = completeConfiguration.name
  // await writeFile(pkgJSONPath, JSON.stringify(pkgJSON, null, 2))

  // discord.conf.json update
  // const tauriConfJSONPath = join(destinationFolder, 'src-discord', 'discord.conf.json')
  // const tauriConfJSONContent = await readFile(tauriConfJSONPath, 'utf8')
  // const tauriConfJSON = JSON.parse(tauriConfJSONContent)
  // log('Setting productName to', completeConfiguration.name)
  // tauriConfJSON.productName = completeConfiguration.name
  // log('Setting version to', completeConfiguration.appVersion)
  // tauriConfJSON.version = completeConfiguration.appVersion
  // log('Setting identifier to', completeConfiguration.appBundleId)
  // tauriConfJSON.identifier = completeConfiguration.appBundleId
  // log('Setting build.devUrl to', appFolder)
  // tauriConfJSON.build.devUrl = appFolder
  // await writeFile(tauriConfJSONPath, JSON.stringify(tauriConfJSON, null, 2))

  log("Installing packages");
  const { all: installOut } = await runPnpm(destinationFolder, {
    args: ["install", "--prefer-offline"],
    signal: abortSignal,
    context,
  });
  if (installOut) log(installOut);

  // override discord version
  // if (completeConfiguration.electronVersion && completeConfiguration.electronVersion !== '') {
  //   log(`Installing discord@${completeConfiguration.electronVersion}`)
  //   await runWithLiveLogs(
  //     process.execPath,
  //     [pnpm, 'install', `discord@${completeConfiguration.electronVersion}`, '--prefer-offline'],
  //     {
  //       cwd: destinationFolder,
  //       env: {
  //         // DEBUG: '*',
  //         PNPM_HOME: pnpmHome
  //       },
  //       cancelSignal: abortSignal
  //     },
  //     log,
  //     {
  //       onStderr(data) {
  //         log(data)
  //       },
  //       onStdout(data) {
  //         log(data)
  //       }
  //     }
  //   )
  // }

  try {
    if (action === "preview") {
      const port = 14141;

      const modulesPath = modules;
      const nitro = join(modulesPath, "nitropack", "dist", "cli", "index.mjs");

      console.log("nitro", nitro);

      await Promise.allSettled([
        runPnpm(destinationFolder, {
          args: ["dlx", "nitropack", "dev"],
          extraEnv: {
            PORT: port.toString(),
          },
          signal: abortSignal,
          context,
        }).then(({ all }) => {
          if (all) log(all);
        }),
        (async () => {
          const tunnel = await startTunnel({ port, acceptCloudflareNotice: true });
          console.log("tunnel", tunnel);
          const url = await tunnel.getURL();
          console.log("Public URL:", url);
        })(),
      ]);
    } else {
      throw new Error("TODO");
    }

    return undefined;
  } catch (e) {
    if (e instanceof Error) {
      if (e.name === "RequestError") {
        log("Request error");
      }
      if (e.name === "RequestError") {
        log("Request error");
      }
    }
    log(e);
    return undefined;
  }
};
