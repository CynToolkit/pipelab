import * as p from "@clack/prompts";
import { createPipelabCloudAuthClient, PipelabContext } from "@pipelab/core-node";
import { loginToPoki, loginToSteam } from "@pipelab/providers";
import { Command, Option } from "commander";
import { getDefaultUserDataPath } from "../paths";

const contextFor = (userDataPath?: string) =>
  new PipelabContext({ userDataPath: userDataPath || getDefaultUserDataPath() });

const userDataOption = () => new Option("--user-data <path>", "Custom user-data directory");

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Integration login failed.";

export const registerSettingsCommands = (program: Command) => {
  const settings = program.command("settings").description("Manage Pipelab settings");
  const integrations = settings
    .command("integrations")
    .description("Authenticate publishing integrations");

  const cloud = settings.command("cloud").description("Manage Pipelab Cloud sign-in");
  cloud
    .command("login")
    .description("Sign in to Pipelab Cloud for local artifact uploads")
    .addOption(userDataOption())
    .action(async (options: { userData?: string }) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error(
          "Pipelab Cloud login needs an interactive terminal. CI authentication is not available.",
        );
        process.exitCode = 1;
        return;
      }
      const email = await p.text({
        message: "Pipelab account email",
        validate: (value) => (value?.trim() ? undefined : "Enter your account email."),
      });
      if (p.isCancel(email)) return;
      const password = await p.password({
        message: "Pipelab account password",
        validate: (value) => (value ? undefined : "Enter your account password."),
      });
      if (p.isCancel(password)) return;

      try {
        const client = createPipelabCloudAuthClient(contextFor(options.userData));
        if (!client) throw new Error("Pipelab Cloud is not configured for this installation.");
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) {
          console.log("Check your email to verify the account before uploading to Pipelab Cloud.");
          return;
        }
        console.log(`Signed in to Pipelab Cloud as ${data.user.email ?? email.trim()}.`);
        console.log("Your local session is stored in the operating system credential store.");
      } catch (error) {
        console.error(errorMessage(error));
        process.exitCode = 1;
      }
    });

  cloud
    .command("status")
    .description("Check local Pipelab Cloud sign-in")
    .addOption(userDataOption())
    .action(async (options: { userData?: string }) => {
      try {
        const client = createPipelabCloudAuthClient(contextFor(options.userData));
        if (!client) throw new Error("Pipelab Cloud is not configured for this installation.");
        const { data, error } = await client.auth.getUser();
        if (error || !data.user || data.user.is_anonymous) {
          console.log("Not signed in to Pipelab Cloud.");
          return;
        }
        console.log(`Signed in to Pipelab Cloud as ${data.user.email ?? "your Pipelab account"}.`);
      } catch (error) {
        console.error(errorMessage(error));
        process.exitCode = 1;
      }
    });

  cloud
    .command("logout")
    .description("Remove the local Pipelab Cloud session")
    .addOption(userDataOption())
    .action(async (options: { userData?: string }) => {
      try {
        const client = createPipelabCloudAuthClient(contextFor(options.userData));
        if (!client) throw new Error("Pipelab Cloud is not configured for this installation.");
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        console.log("Signed out of Pipelab Cloud on this device.");
      } catch (error) {
        console.error(errorMessage(error));
        process.exitCode = 1;
      }
    });

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
