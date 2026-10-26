import type { SupportedStorage } from "@supabase/supabase-js";
import type { PipelabContext } from "../context";

type KeyringEntry = {
  getPassword(): string | null | Promise<string | null>;
  setPassword(password: string): unknown;
  deletePassword(): unknown;
};

/** Supabase Auth storage backed by the operating system credential store. */
export class SecureCloudAuthStorage implements SupportedStorage {
  private entryPromise?: Promise<KeyringEntry>;
  private readonly account: string;

  constructor(context: PipelabContext) {
    this.account = context.getConfigPath("cloud-auth-session");
  }

  private getEntry() {
    this.entryPromise ??= import("@napi-rs/keyring")
      .then(({ Entry }) => new Entry("Pipelab CLI", this.account) as unknown as KeyringEntry)
      .catch(() => {
        throw new Error(
          "Pipelab Cloud CLI sign-in needs an available operating system credential store.",
        );
      });
    return this.entryPromise;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const password = await (await this.getEntry()).getPassword();
      if (!password) return null;
      const data: unknown = JSON.parse(password);
      if (!data || typeof data !== "object" || !(key in data)) return null;
      const value = (data as Record<string, unknown>)[key];
      return typeof value === "string" ? value : null;
    } catch (error) {
      if (error instanceof Error && error.message.includes("credential store")) throw error;
      throw new Error(
        "Could not read Pipelab Cloud sign-in from the operating system credential store.",
      );
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const entry = await this.getEntry();
    let data: Record<string, string> = {};
    try {
      const password = await entry.getPassword();
      if (password) {
        const parsed: unknown = JSON.parse(password);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          data = Object.fromEntries(
            Object.entries(parsed).filter(
              (item): item is [string, string] => typeof item[1] === "string",
            ),
          );
        }
      }
    } catch {
      throw new Error(
        "Could not read Pipelab Cloud sign-in from the operating system credential store.",
      );
    }
    data[key] = value;
    try {
      await entry.setPassword(JSON.stringify(data));
    } catch {
      throw new Error(
        "Could not save Pipelab Cloud sign-in to the operating system credential store.",
      );
    }
  }

  async removeItem(key: string): Promise<void> {
    const entry = await this.getEntry();
    let data: Record<string, string> = {};
    try {
      const password = await entry.getPassword();
      if (password) {
        const parsed: unknown = JSON.parse(password);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          data = Object.fromEntries(
            Object.entries(parsed).filter(
              (item): item is [string, string] => typeof item[1] === "string",
            ),
          );
        }
      }
      delete data[key];
      if (Object.keys(data).length) await entry.setPassword(JSON.stringify(data));
      else await entry.deletePassword();
    } catch {
      throw new Error(
        "Could not clear Pipelab Cloud sign-in from the operating system credential store.",
      );
    }
  }
}
