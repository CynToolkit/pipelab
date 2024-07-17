import { createAction, createActionRunner } from "@cyn/plugin-core";

export const ID = "unzip-file-node";

export const unzip = createAction({
  id: ID,
  name: "Unzip file",
  displayString: '`Unzip ${params.file}`',
  params: {
    file: {
      control: {
        type: 'path',
      },
      value: '',
      label: "File",
    },
  },

  outputs: {
    output: {
      value: '',
      label: "Output",
    },
  },
  description: "Unzip a file to a specified folder",
  icon: "",
  meta: {},
});


export const unzipRunner = createActionRunner<typeof unzip>(async ({ log, inputs, setOutput, cwd }) => {
  const StreamZip = await import('node-stream-zip');
  const fs = await import("node:fs");
  const { join } = await import('node:path');

  log("");

  log("inputs", inputs);

  log("inputs.file", inputs.file);
  const file = inputs.file;
  log("file", file);
  const output = join(cwd)

  log('file', file)
  log('output', output)

  const zip = new StreamZip.default.async({ file });

  const bytes = await zip.extract(null, output)
  await zip.close();

  log("bytes", bytes);

  // const files = response;

  // log("-- setValue('paths')");
  setOutput(
    "output",
    output
  );
})