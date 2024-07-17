import { describe, expect, test } from "vitest";
import { copyRunner } from "./copy.js";
import mock from "mock-fs";
import { readFile } from "node:fs/promises";

describe("copy", () => {
  test.only("copy file to file", async () => {
    const outputs: Record<string, unknown> = {};

    const sourcePath = "/source/source-file.txt";
    const sourceContent = "text";

    const destinationPath = "/destination/destination-file.txt";
    const files = {
      [sourcePath]: sourceContent,
      "/destination": {},
    };

    mock(files);

    await copyRunner({
      cwd: "",
      inputs: {
        from: sourcePath,
        to: destinationPath,
        recursive: false,
      },
      log: (...args) => {
        console.log(...args);
      },
      setOutput: (key, value) => {
        outputs[key] = value;
      },
      meta: {
        definition: "",
      },
      setMeta: () => {
        console.log("set meta defined here");
      },
      paths: {
        assets: '',
        unpack: ''
      }
    });

    const data = await readFile(destinationPath, "utf-8");

    expect(data).toBe(sourceContent);
  });

  test.only("copy file to file where parent folder doesn't exist", async () => {
    const outputs: Record<string, unknown> = {};

    const sourcePath = "/source/source-file.txt";
    const sourceContent = "text";

    const destinationPath = "/destination/destination-file.txt";
    const files = {
      [sourcePath]: sourceContent,
    };

    mock(files);

    await copyRunner({
      cwd: "",
      inputs: {
        from: sourcePath,
        to: destinationPath,
        recursive: false,
      },
      log: (...args) => {
        console.log(...args);
      },
      setOutput: (key, value) => {
        outputs[key] = value;
      },
      meta: {
        definition: "",
      },
      setMeta: () => {
        console.log("set meta defined here");
      },
      paths: {
        assets: '',
        unpack: ''
      }
    });

    const data = await readFile(destinationPath, "utf-8");

    expect(data).toBe(sourceContent);
  })
});
