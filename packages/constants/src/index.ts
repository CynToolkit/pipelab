export const name = "Pipelab";
export const appIdentifier = "pipelab";

export const outFolderName = (binName: string, platform: string, arch: string) => {
  let platformName = "";
  let archName = "";

  console.log("platform", platform);

  if (platform === "linux") {
    platformName = "linux";
  } else if (platform === "win32") {
    platformName = "win32";
  } else if (platform === "darwin") {
    platformName = "darwin";
  } else {
    throw new Error("Unsupported platform");
  }

  if (arch === "x64") {
    archName = "x64";
  } else if (arch === "arm") {
    archName = "arm";
  } else if (arch === "arm64") {
    archName = "arm64";
  } else if (arch === "ia32") {
    archName = "ia32";
  } else {
    throw new Error("Unsupported architecture");
  }

  return `${binName}-${platformName}-${archName}`;
};

/**
 * Get the binary name for a given platform
 * @param name
 * @param platform If not provided, it will try to use process.platform (Node.js only)
 * @returns
 */
export const getBinName = (name: string, platform?: string) => {
  const p = platform || (typeof process !== "undefined" ? process.platform : "unknown");
  if (p === "win32") {
    return `${name}.exe`;
  }
  if (p === "darwin") {
    return `${name}.app/Contents/MacOS/${name}`;
  }
  return name;
};

export const websocketPort = 33753;
export const uiDevPort = 5173;

export const uiDevServerInstruction = "pnpm dev --filter=@pipelab/ui";

export const getUiDevServerFatalError = (port: number) => `
--------------------------------------------------------------------------------
  [FATAL ERROR] UI dev server is NOT running on port ${port}
  Please start it manually before running the desktop app:
    '${uiDevServerInstruction}'
--------------------------------------------------------------------------------`;

export const getUiDevServerMissingWarning = () => `
--------------------------------------------------------------------------------
  [DEVELOPMENT MODE] CLI server started (API/WebSocket).
  NOTE: The UI is NOT served from this process in development.
  Please ensure the UI dev server is running:
    '${uiDevServerInstruction}'
--------------------------------------------------------------------------------`;
