import StreamZip from "node-stream-zip";
import { join } from "node:path";
import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";

export const ID = "unzip-file-node";

export const unzip = createAction({
  id: ID,
  name: "Unzip file",
  displayString: '`Unzip ${fmt.param(params.file, "primary", "No file specified")}`',
  params: {
    file: createPathParam("", {
      required: true,
      control: {
        type: "path",
        options: {
          properties: ["openFile"],
        },
      },
      label: "File",
    }),
  },

  outputs: {
    output: {
      value: "",
      label: "Output",
    },
  },
  description: "Unzip a file to a specified folder",
  icon: "",
  meta: {},
});

export const unzipRunner = createActionRunner<typeof unzip>(
  async ({ log, inputs, setOutput, cwd, abortSignal }) => {
    if (abortSignal.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const file = inputs.file;
    const output = join(cwd);

    log("Unzip file", inputs.file, "to", output);

    const zip = new StreamZip.async({ file });

    const onAbort = () => {
      zip.close().catch(() => {});
    };

    abortSignal.addEventListener("abort", onAbort);

    try {
      await zip.extract(null, output);
      await zip.close();
      setOutput("output", output);
    } catch (e: any) {
      if (abortSignal.aborted) {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      }
      throw e;
    } finally {
      abortSignal.removeEventListener("abort", onAbort);
    }
  },
);
