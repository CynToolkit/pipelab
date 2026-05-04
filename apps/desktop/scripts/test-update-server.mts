import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

// Path to the 'make' directory where forge puts build artifacts
const MAKE_DIR = path.resolve(__dirname, "..", "out", "make");

const server = http.createServer((req, res) => {
  console.log(`[Mock Server] Requested: ${req.url}`);

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // 1. Handle Squirrel.Windows RELEASES file
  if (pathname === "/RELEASES" || pathname.endsWith("/RELEASES")) {
    // Try to find the RELEASES file in the squirrel directory
    const squirrelDir = path.join(MAKE_DIR, "squirrel.windows", "x64");
    const releasesPath = path.join(squirrelDir, "RELEASES");

    if (fs.existsSync(releasesPath)) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      fs.createReadStream(releasesPath).pipe(res);
      return;
    }
  }

  // 2. Handle macOS Update JSON (Native autoUpdater protocol)
  if (pathname === "/update/macos") {
    // This is a simplified mock for macOS native protocol
    // It expects a JSON with a 'url' property if an update is available
    // or a 204 No Content if no update.
    const version = process.env.APP_VERSION || "1.0.1";
    const dmgPath = path.join(MAKE_DIR, "zip", "darwin", "x64", `pipelab-v${version}.zip`);

    if (fs.existsSync(dmgPath)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          url: `http://localhost:${PORT}/download/macos/pipelab-v${version}.zip`,
        }),
      );
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  // 3. Serve static files (.nupkg, .zip, .exe, etc.)
  // We search recursively in the MAKE_DIR for the file basename
  const basename = path.basename(pathname);
  const findFile = (dir: string): string | null => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const found = findFile(fullPath);
        if (found) return found;
      } else if (file === basename) {
        return fullPath;
      }
    }
    return null;
  };

  try {
    const filePath = findFile(MAKE_DIR);
    if (filePath) {
      const ext = path.extname(filePath);
      const contentType =
        {
          ".nupkg": "application/zip",
          ".zip": "application/zip",
          ".exe": "application/x-msdownload",
          ".dmg": "application/x-apple-diskimage",
        }[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  } catch (e) {
    console.error(`[Mock Server] Error searching for file: ${e}`);
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`\n🚀 Mock Update Server running at http://localhost:${PORT}`);
  console.log(`📂 Serving artifacts from: ${MAKE_DIR}`);
  console.log(`\nInstructions for Windows VM:`);
  console.log(`1. Identify your Host IP (e.g., 10.0.2.2 or 192.168.x.x)`);
  console.log(`2. Run Pipelab in VM with env: APP_UPDATE_URL=http://<HOST_IP>:${PORT}`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
