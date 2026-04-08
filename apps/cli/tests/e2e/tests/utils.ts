import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Robustly resolves the project root relative to this utility file.
 */
export const projectRoot = resolve(__dirname, "../../../../../");

/**
 * Robustly resolves the fixtures path relative to this utility file.
 */
export const fixturesPath = resolve(__dirname, "../fixtures");
