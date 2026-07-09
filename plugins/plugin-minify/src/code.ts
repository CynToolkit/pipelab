import { readdir, mkdir, access, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import esbuild from "esbuild";
import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";

export const ID = "minify:code";

export const minifyCode = createAction({
  id: ID,
  name: "Minify code",
  description: "Compress and optimize JavaScript code files inside a folder.",
  icon: "",
  displayString:
    "`Optimize code in ${fmt.param(params['input-folder'], 'primary', 'No folder selected')}`",
  meta: {},
  params: {
    "input-folder": createPathParam("", {
      required: true,
      label: "Folder to optimize",
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
    }),
  },
  outputs: {},
});

const getAllJsFiles = async (dir: string): Promise<string[]> => {
  const files = await readdir(dir, { withFileTypes: true });
  const results = await Promise.all(
    files.map(async (file) => {
      const fullPath = join(dir, file.name);
      if (file.isDirectory()) {
        return getAllJsFiles(fullPath);
      } else if (file.isFile() && fullPath.endsWith(".js")) {
        return [fullPath];
      }
      return [];
    }),
  );
  return results.flat();
};

export const minifyCodeRunner = createActionRunner<typeof minifyCode>(
  async ({ log, inputs, cwd, abortSignal }) => {
    if (abortSignal.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const jsFiles = await getAllJsFiles(inputs["input-folder"]);

    for (const file of jsFiles) {
      if (abortSignal.aborted) {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      await esbuild.build({
        entryPoints: [file], // Process one file at a time
        outfile: file, // Write directly to the original file
        minify: true, // Minify the content
        bundle: false, // Don't bundle dependencies
        sourcemap: false, // No source maps (optional)
        format: "esm", // Optional: Specify output format
        write: true, // Ensure the file is overwritten
      });
      console.log(`Minified: ${file}`);
    }

    log("Minified code");
  },
);
