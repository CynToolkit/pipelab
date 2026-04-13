import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function renameAssets() {
  const pkgPath = path.join(root, "apps/desktop/package.json");
  const pkg = await fs.readJson(pkgPath);
  const version = pkg.version;

  const rawOs = process.argv[2] || process.platform; // ubuntu-latest, windows-latest, macos-latest
  const rawArch = process.argv[3] || process.arch; // x64, arm64

  const osMap = {
    "ubuntu-latest": "linux",
    "windows-latest": "win",
    "macos-latest": "macos",
    "darwin": "macos",
    "win32": "win",
    "linux": "linux"
  };

  const os = osMap[rawOs] || rawOs;
  const arch = rawArch;

  console.log(`INFO: Renaming assets for ${os} ${arch} (version ${version})...`);

  // --- Desktop Assets ---
  const desktopMakeDir = path.join(root, "apps/desktop/out/make");
  if (await fs.pathExists(desktopMakeDir)) {
    const files = await fs.promises.readdir(desktopMakeDir, { recursive: true });

    for (const relativeFile of files) {
      const file = path.join(desktopMakeDir, relativeFile);
      const stats = await fs.stat(file);
      if (stats.isDirectory()) continue;

      const ext = path.extname(file);
      const basename = path.basename(file);

      let newName = "";

      // Only rename main installer/archive files
      if (ext === ".zip" || ext === ".dmg" || ext === ".exe" || ext === ".deb" || ext === ".rpm") {
        // Avoid renaming RELEASES or other support files if they were picked up
        if (basename.toLowerCase().includes("pipelab")) {
          newName = `pipelab-desktop-v${version}-${os}-${arch}${ext}`;
        }
      }

      if (newName && basename !== newName) {
        const dest = path.join(path.dirname(file), newName);
        console.log(`INFO: Renaming ${basename} -> ${newName}`);
        await fs.rename(file, dest);
      }
    }
  } else {
    console.warn(`WARN: Desktop make directory not found at ${desktopMakeDir}`);
  }

  // --- CLI Assets ---
  const cliBinDir = path.join(root, "apps/cli/bin");
  if (await fs.pathExists(cliBinDir)) {
    const files = await fs.readdir(cliBinDir);

    for (const file of files) {
      const basename = path.basename(file);
      let newName = "";

      if ((basename === "pipelab-linux" || basename === "pipelab") && os === "linux") {
        newName = `pipelab-cli-v${version}-linux-x64`;
      } else if ((basename === "pipelab-win.exe" || basename === "pipelab.exe") && os === "win") {
        newName = `pipelab-cli-v${version}-win-x64.exe`;
      } else if ((basename === "pipelab-macos" || basename === "pipelab") && os === "macos") {
        // pkg default output for macos is usually x64 currently
        // If we add arm64, we'll need to be more specific
        newName = `pipelab-cli-v${version}-macos-${arch}`;
      }

      if (newName && basename !== newName) {
        const src = path.join(cliBinDir, file);
        const dest = path.join(cliBinDir, newName);
        console.log(`INFO: Renaming CLI ${basename} -> ${newName}`);
        await fs.rename(src, dest);

        // Ensure executable permissions for non-Windows platforms
        if (os !== "win") {
          console.log(`INFO: Setting executable permissions for ${newName}`);
          await fs.chmod(dest, 0o755);
        }
      } else if (os !== "win") {
        // Even if not renamed, ensure it's executable if it's a CLI binary
        const src = path.join(cliBinDir, file);
        if (
          basename.includes("pipelab-cli") ||
          basename === "pipelab-linux" ||
          basename === "pipelab-macos"
        ) {
          console.log(`INFO: Ensuring executable permissions for ${basename}`);
          await fs.chmod(src, 0o755);
        }
      }
    }
  } else {
    console.warn(`WARN: CLI bin directory not found at ${cliBinDir}`);
  }
}

renameAssets().catch((err) => {
  console.error("ERROR: Failed to rename assets:", err);
  process.exit(1);
});
