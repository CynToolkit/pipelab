// @ts-check
import express from "express";
import { exec } from "child_process";
import { watch } from "chokidar";
import cors from "cors";
import _pluginConfig from "./src/pluginConfig.js";

let pluginConfig = _pluginConfig

let hasWrapperBuild = false;
let runBuildWrapperExtension = () => {};
try {
  runBuildWrapperExtension = require("./buildWrapperExtension.js");
  hasWrapperBuild = true;
} catch (e) {
  console.log("No wrapper extension found.");
  hasWrapperBuild = false;
}
import { existsSync } from "fs";

const srcCppExists = existsSync("./src_cpp");

let port = 3000;
const path = () => `http://localhost:${port}/addon.json`;

let hasWrapperExtension =
  hasWrapperBuild &&
  pluginConfig.extensionScript &&
  pluginConfig.extensionScript.enabled;
let watchWrapperExtension =
  hasWrapperExtension && pluginConfig.extensionScript.watch;

let listenInputs = false; // listen for keypresses
// watch for keypresses
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

process.stdin.on("data", function (key) {
  if (!listenInputs) return;
  // if the extension script is enabled and set to watch, watch the extension script
  if (hasWrapperExtension && !watchWrapperExtension) {
    if (key === "r") {
      runBuild(true);
    }
  }

  // console.log(key);

  if (key === "\u0003") {
    // if ctrl+c is pressed, exit
    process.exit();
  }

  if (key === "c") {
    // if ctrl+c is pressed, exit
    // else copy to clipboard
    process.stdin.pause();
    exec(`echo ${path()} | clip`);
    console.log("Copied to clipboard.");
    process.stdin.resume();
  }
  if (key === "q") {
    process.exit();
  }
});

process.on("SIGINT", function () {
  process.exit();
});

process.on("SIGTERM", function () {
  process.exit();
});

// Execute build command
const runBuild = async (buildWrapperExtension = false) => {
  listenInputs = false;
  // if the extension script is enabled and set to watch, watch the extension script
  if (buildWrapperExtension && hasWrapperExtension) {
    await runBuildWrapperExtension();
  }

  console.log("Running build...");
  exec("node build.js --dev", async (error, stdout, stderr) => {
    if (error) {
      console.log(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.log("Build complete.");
    // log addon.json file path and copy it to the clipboard
    console.log("addon.json file path:");
    console.log(path());

    // if the extension script is enabled and set to watch, watch the extension script
    // delete require.cache[require.resolve("./src/pluginConfig.js")];
    pluginConfig = (await import("./src/pluginConfig.js")).default;
    const newHasWrapperExtension =
      hasWrapperBuild &&
      pluginConfig.extensionScript &&
      pluginConfig.extensionScript.enabled;
    const newWatchWrapperExtension =
      hasWrapperExtension && pluginConfig.extensionScript.watch;

    if (
      newHasWrapperExtension !== hasWrapperExtension ||
      newWatchWrapperExtension !== watchWrapperExtension
    ) {
      console.log("Wrapper Extension State changed");
      hasWrapperExtension = newHasWrapperExtension;
      watchWrapperExtension = newWatchWrapperExtension;

      if (watchWrapperExtension) {
        console.log("Now watching Wrapper Extension");
        runBuild(true);
      } else {
        console.log("No longer watching Wrapper Extension");
      }
    }

    console.log("Press c to copy the path to the clipboard.");
    if (hasWrapperExtension && !watchWrapperExtension)
      console.log("Press r to rebuild the wrapper extension.");
    console.log("Press q to quit.");
    listenInputs = true;
  });
};

// Run initial build
runBuild(true);

// Watch for file changes in the src directory
const watcher = watch("src", {
  ignored: /(^|[\/\\])\../,
  persistent: true,
});
let wrapperWatcher;
if (srcCppExists) {
  wrapperWatcher = watch("src_cpp/Project/**/*.cpp", {
    ignored: /(^|[\/\\])\../,
    persistent: true,
  });
}

// Re-run build on file change
watcher.on("change", (path) => {
  console.log(`File ${path} has been changed. Re-running build...`);
  runBuild(false);
});

// if the extension script is enabled and set to watch, watch the extension script
if (watchWrapperExtension && srcCppExists) {
  // Re-run build on file change
  wrapperWatcher.on("change", (path) => {
    console.log(`File ${path} has been changed. Re-running build...`);
    runBuild(true);
  });
}

// Create an express application
const app = express();

// Enable all CORS requests
app.use(cors());

// Serve static files from the 'export' directory
app.use(express.static("export"));

// Start the server
function tryListen() {
  app.listen(port, () => {
    console.log("Server is running at http://localhost:" + port);

    // log addon.json file path and copy it to the clipboard
    console.log("addon.json file path:");
    console.log(path());
  });
}

process.on("uncaughtException", function (err) {
  if (err.code === "EADDRINUSE") {
    console.log(`Port ${port} is already in use. Trying another port...`);
    port++;
    tryListen();
  } else {
    console.log(err);
    process.exit(1);
  }
});

tryListen();
