import fs from "node:fs";
import path from "node:path";
import { useLogger } from "@pipelab/shared";
import { PipelabContext } from "../context";

/**
 * A generic file-based storage implementation for persisting JSON data.
 * Useful for Supabase Auth and other CLI-specific persistent data.
 */
export class JsonFileStorage {
  private filePath: string;
  private logger = useLogger().logger;

  constructor(fileName: string, context: PipelabContext) {
    this.filePath = path.join(context.userDataPath, fileName);
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        this.logger().error(`[Storage] Failed to create directory ${dir}:`, e);
        throw e;
      }
    }
  }

  getItem(key: string): string | null {
    try {
      if (!fs.existsSync(this.filePath)) return null;
      const content = fs.readFileSync(this.filePath, "utf8");
      if (!content) return null;
      const data = JSON.parse(content);
      return data[key] || null;
    } catch (e) {
      this.logger().error(`[Storage] Failed to read or parse ${this.filePath}:`, e);
      // We throw here because the user explicitly asked NOT to ignore errors
      throw e;
    }
  }

  setItem(key: string, value: string): void {
    try {
      let data: any = {};
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, "utf8");
        if (content) {
          data = JSON.parse(content);
        }
      }
      data[key] = value;
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      this.logger().error(`[Storage] Failed to write to ${this.filePath}:`, e);
      throw e;
    }
  }

  removeItem(key: string): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const content = fs.readFileSync(this.filePath, "utf8");
      if (!content) return;
      const data = JSON.parse(content);
      delete data[key];
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      this.logger().error(`[Storage] Failed to remove key from ${this.filePath}:`, e);
      throw e;
    }
  }

  /**
   * Helper to get the entire data object
   */
  getAll(): Record<string, any> {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const content = fs.readFileSync(this.filePath, "utf8");
      return content ? JSON.parse(content) : {};
    } catch (e) {
      this.logger().error(`[Storage] Failed to read all data from ${this.filePath}:`, e);
      throw e;
    }
  }

  /**
   * Helper to clear the entire storage file
   */
  clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch (e) {
      this.logger().error(`[Storage] Failed to clear ${this.filePath}:`, e);
      throw e;
    }
  }
}
