import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const runnerTemp = process.env.RUNNER_TEMP;
const githubEnv = process.env.GITHUB_ENV;
if (!runnerTemp || !githubEnv) throw new Error("Expected a GitHub Actions runner environment.");

const root = join(runnerTemp, "pipelab-local-release-acceptance");
const home = join(root, "home");
const userDataBase =
  process.platform === "win32"
    ? join(root, "roaming")
    : process.platform === "darwin"
      ? join(home, "Library", "Application Support")
      : join(root, "config");
// The Desktop package version is beta, so its authenticated CLI server reads app-beta.
const userDataPath = join(userDataBase, "@pipelab", "app-beta");
const profileUserData = join(root, "construct-profile");
await mkdir(userDataPath, { recursive: true });
await mkdir(profileUserData, { recursive: true });

const env = [
  `PIPELAB_CI_USER_DATA=${userDataPath}`,
  `CONSTRUCT_CI_PROFILE_USER_DATA=${profileUserData}`,
];
if (process.platform === "win32") env.push(`APPDATA=${userDataBase}`);
else if (process.platform === "darwin") env.push(`HOME=${home}`);
else env.push(`XDG_CONFIG_HOME=${userDataBase}`);

await appendFile(githubEnv, `${env.join("\n")}\n`);
console.log("Created isolated temporary Pipelab and Construct profile directories.");
