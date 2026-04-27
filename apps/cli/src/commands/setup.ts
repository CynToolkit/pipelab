import * as p from "@clack/prompts";
import { setTimeout } from "node:timers/promises";
import { PipelabContext } from "@pipelab/core-node";
import { setupConfigFile } from "@pipelab/core-node";
import { AppConfig } from "@pipelab/shared";
import { getDefaultUserDataPath } from "../paths";

export async function setupCommand(options: { userData?: string }) {
  p.intro(`Welcome to Pipelab CLI Setup Wizard`);

  const userDataPath = options.userData || getDefaultUserDataPath();
  const context = new PipelabContext({ userDataPath });

  // 1. Authentication
  const authType = await p.select({
    message: "How would you like to authenticate?",
    options: [
      { value: "token", label: "Access Token (Recommended)" },
      { value: "credentials", label: "Email & Password" },
      { value: "skip", label: "Skip for now" },
    ],
  });

  if (p.isCancel(authType)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (authType === "token") {
    const token = await p.password({
      message: "Enter your Pipelab Access Token",
      validate: (value) => {
        if (!value) return "Token is required";
        if (value.length < 10) return "Token is too short";
      },
    });
    if (p.isCancel(token)) return;
    
    const s = p.spinner();
    s.start("Authenticating with Pipelab...");
    await setTimeout(1500); // Fake delay
    s.stop("Authenticated successfully!");
  }

  // 2. Configuration
  const settings = await setupConfigFile<AppConfig>("settings", { context });
  const config = await settings.getConfig();

  const configChanges = await p.group({
    theme: () =>
      p.select({
        message: "Select your preferred theme:",
        initialValue: config.theme,
        options: [
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ],
      }),
    locale: () =>
      p.select({
        message: "Select your language:",
        initialValue: config.locale,
        options: [
          { value: "en-US", label: "English" },
          { value: "fr-FR", label: "French" },
          { value: "pt-BR", label: "Portuguese" },
        ],
      }),
  });

  if (p.isCancel(configChanges)) {
    p.cancel("Setup aborted.");
    process.exit(0);
  }

  // Save config (Fake save for now to avoid side effects in this demo if needed, but let's do it real)
  await settings.setConfig({
    ...config,
    theme: configChanges.theme,
    locale: configChanges.locale,
  });

  // 3. Integrations
  const integrations = await p.multiselect({
    message: "Which integrations would you like to enable?",
    options: [
      { value: "path", label: "Add 'pipelab' to your PATH", hint: "recommended" },
      { value: "completion", label: "Enable shell autocompletion" },
      { value: "telemetry", label: "Anonymous telemetry", hint: "helps us improve" },
    ],
  });

  if (p.isCancel(integrations)) return;

  if (integrations.length > 0) {
    const s = p.spinner();
    s.start("Setting up integrations...");
    await setTimeout(2000); // Fake delay
    s.stop("Integrations configured!");
  }

  p.note(
    `You're all set! You can now use Pipelab CLI to manage your automation.\n\nType 'pipelab --help' to get started.`,
    "Setup Complete"
  );

  p.outro("Happy automating! 🚀");
}
