import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const name = (formData.get("name") as string) || "Construct3Game";
    const version = (formData.get("version") as string) || "1.0.0";
    const platform = (formData.get("platform") as string) || "win32";

    if (!file) {
      throw new Error("No file uploaded");
    }

    // 1. Download base Electron zip for the selected platform
    let electronUrl = "";
    if (platform === "win32") {
      electronUrl = "https://github.com/electron/electron/releases/download/v30.0.0/electron-v30.0.0-win32-x64.zip";
    } else if (platform === "linux") {
      electronUrl = "https://github.com/electron/electron/releases/download/v30.0.0/electron-v30.0.0-linux-x64.zip";
    } else {
      throw new Error("Unsupported platform");
    }

    const electronRes = await fetch(electronUrl);
    if (!electronRes.ok) {
      throw new Error(`Failed to download base Electron zip: ${electronRes.statusText}`);
    }
    const electronBytes = await electronRes.arrayBuffer();

    // 2. Load both zip files
    const electronZip = await JSZip.loadAsync(electronBytes);
    const c3ZipBytes = await file.arrayBuffer();
    const c3Zip = await JSZip.loadAsync(c3ZipBytes);

    // 3. Inject C3 files into resources/app/
    const packageJson = JSON.stringify({
      name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      version: version,
      main: "main.js",
    }, null, 2);

    const mainJs = `
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
`;

    // Write package.json and main.js to resources/app/
    electronZip.file("resources/app/package.json", packageJson);
    electronZip.file("resources/app/main.js", mainJs);

    // Copy all files from the Construct 3 export zip to resources/app/
    for (const [relativePath, zipEntry] of Object.entries(c3Zip.files)) {
      if (!zipEntry.dir) {
        const content = await zipEntry.async("uint8array");
        electronZip.file(`resources/app/${relativePath}`, content);
      }
    }

    // 4. Rename electron.exe (Windows) or electron (Linux)
    if (platform === "win32") {
      const electronExe = electronZip.file("electron.exe");
      if (electronExe) {
        const content = await electronExe.async("uint8array");
        electronZip.file(`${name}.exe`, content);
        electronZip.remove("electron.exe");
      }
    } else if (platform === "linux") {
      const electronBin = electronZip.file("electron");
      if (electronBin) {
        const content = await electronBin.async("uint8array");
        electronZip.file(`${name}`, content);
        electronZip.remove("electron");
      }
    }

    // 5. Generate the output zip file
    const outputBytes = await electronZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    return new Response(outputBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}-electron.zip"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
