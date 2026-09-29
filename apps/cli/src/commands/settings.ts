import * as p from "@clack/prompts";
import { PipelabContext } from "@pipelab/core-node";
import { loginToPoki } from "@pipelab/plugin-poki/auth";
import { loginToSteam } from "@pipelab/plugin-steam/login";
import { Command, Option } from "commander";
import { getDefaultUserDataPath } from "../paths";

const contextFor = (userDataPath?: string) =>
  new PipelabContext({ userDataPath: userDataPath || getDefaultUserDataPath() });

const userDataOption = () => new Option("--user-data <path>", "Custom user-data directory");

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Integration login failed.";

export const registerSettingsCommands = (program: Command) => {
  const integrations = program
    .command("settings")
    .description("Manage Pipelab settings")
    .command("integrations")
    .description("Authenticate publishing integrations");

  integrations
    .command("poki")
    .description("Manage Poki authentication")
    .command("login")
    .description("Sign in to Poki and save the token without uploading a build")
    .addOption(userDataOption())
    .action(async (options: { userData?: string }) => {
      try {
        const context = contextFor(options.userData);
        await loginToPoki(context.getThirdPartyPath());
        console.log("Poki login saved. No build was uploaded.");
      } catch (error) {
        console.error(errorMessage(error));
        process.exitCode = 1;
      }
    });

  integrations
    .command("steam")
    .description("Manage SteamCMD authentication")
    .command("login")
    .description("Sign in to SteamCMD and save its login cache")
    .addOption(userDataOption())
    .action(async (options: { userData?: string }) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error(
          "Steam login needs an interactive terminal for your password and Steam Guard code.",
        );
        process.exitCode = 1;
        return;
      }

      const username = await p.text({
        message: "Steam username",
        validate: (value) => (value?.trim() ? undefined : "Enter your Steam username."),
      });
      if (p.isCancel(username)) {
        p.cancel("Steam sign-in cancelled.");
        return;
      }

      try {
        const context = contextFor(options.userData);
        await loginToSteam(context, username);
        console.log("SteamCMD login saved. No build was uploaded.");
      } catch (error) {
        console.error(errorMessage(error));
        process.exitCode = 1;
      }
    });
};
