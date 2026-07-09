import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { createAction, createActionRunner, createPathParam } from "@pipelab/plugin-core";

export const ID = "zip-node";

export type MaybeArray<T> = T | T[];

export const getValue = <T>(array: MaybeArray<T>): T => {
  if (Array.isArray(array)) {
    return array[0];
  } else {
    return array;
  }
};

export const zip = createAction({
  id: ID,
  name: "Zip",
  version: 1,
  deprecated: true,
  deprecatedMessage: "Use the new Zip V2 block instead.",
  updateAvailable: true,
  displayString:
    '`Zip ${fmt.param(params.folder, "primary", "No folder specified")} to ${fmt.param(params.output, "secondary", "No output specified")}`',
  params: {
    folder: createPathParam("", {
      required: true,
      control: {
        type: "path",
        options: {
          properties: ["openDirectory"],
        },
      },
      label: "Folder",
    }),
    output: createPathParam("", {
      required: true,
      control: {
        type: "path",
        options: {
          properties: ["openFile", "promptToCreate"],
          // must be zip file
          filters: [
            {
              extensions: ["zip"],
              name: "Zip file",
            },
          ],
        },
      },
      label: "Folder",
    }),
  },

  outputs: {
    path: {
      value: "",
      label: "Path",
    },
  },
  description: "Zip a folder into a .zip file",
  icon: "",
  meta: {},
});

export const zipRunner = createActionRunner<typeof zip>(
  async ({ log, inputs, setOutput, abortSignal }) => {
    const { folder, output: outputPath } = inputs;

    if (!folder) {
      throw new Error("Missing folder");
    }

    if (!outputPath) {
      throw new Error("Missing output path");
    }

    if (abortSignal.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const output = createWriteStream(outputPath);

    const archive = archiver("zip", {
      zlib: { level: 9 }, // Sets the compression level.
    });

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        try {
          archive.abort();
        } catch {}
        try {
          output.destroy();
        } catch {}
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        reject(abortError);
      };

      abortSignal.addEventListener("abort", onAbort);

      output.on("close", function () {
        abortSignal.removeEventListener("abort", onAbort);
        setOutput("path", outputPath);
        resolve();
      });

      output.on("end", function () {
        console.log("Data has been drained");
      });

      archive.on("warning", function (err) {
        if (err.code === "ENOENT") {
          console.log("Archiver warning: ENOENT");
        } else {
          abortSignal.removeEventListener("abort", onAbort);
          reject(err);
        }
      });

      archive.on("error", function (err) {
        abortSignal.removeEventListener("abort", onAbort);
        reject(err);
      });

      // archive.on('data', function (data) {
      //   log('data', data)
      // })
      // archive.on('progress', function (data) {
      //   /* {
      //     entries:
      //      {
      //        total: 5012,
      //        processed: 5012
      //      },
      //     fs:
      //      {
      //        totalBytes: 318794388,
      //        processedBytes: 318794388
      //      }
      //   } */
      //   // log('progress', data.entries.processed + '/' + data.entries.total)
      // })
      archive.on("entry", function (data) {
        log("Adding", data.name);
      });
      archive.on("finish", function () {
        log("finish");
      });

      archive.pipe(output);

      archive.directory(folder, false);

      archive.finalize();
    });
  },
);
