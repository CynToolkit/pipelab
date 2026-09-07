// @ts-nocheck

import { PresetFn, SavedFile } from "@pipelab/shared";

export const demoPreset: PresetFn = async () => {
  const startId = "manual-start";
  const exportConstructProjectId = "export-construct-project";
  const listFilesNodeId = "list-files-node";
  const logOkId = "log-ok";

  const data: SavedFile = {
    version: "6.0.0",
    variables: [],
    name: "demo",
    description: "demo",
    canvas: {
      blocks: [
        {
          type: "event",
          origin: {
            pluginId: "@pipelab/plugin-system",
            nodeId: "manual",
          },
          uid: startId,
          params: {},
        },
        {
          type: "action",
          origin: {
            pluginId: "@pipelab/plugin-construct",
            nodeId: "export-construct-project",
          },
          uid: exportConstructProjectId,
          params: {
            version: "300",
            username: "quentin",
            password: "aaa",
            headless: false,
          },
        },
        {
          type: "action",
          origin: {
            pluginId: "@pipelab/plugin-filesystem",
            nodeId: "list-files-node",
          },
          uid: listFilesNodeId,
          params: {
            folder: "/home/quentin/Téléchargements/sourcegit/",
            recursive: true,
          },
        },
        {
          type: "loop",
          origin: {
            pluginId: "@pipelab/plugin-system",
            nodeId: "for",
          },

          params: {
            value: `{{ steps['${listFilesNodeId}']['outputs']['paths'] }}`,
          },
          children: [
            {
              type: "condition",
              origin: {
                pluginId: "@pipelab/plugin-filesystem",
                nodeId: "is-file",
              },
              uid: "is-file-condition",

              params: {
                path: `{{ steps['${listFilesNodeId}']['outputs']['paths'][context.loopindex] }}`,
              },
              branchTrue: [
                {
                  type: "action",
                  origin: {
                    pluginId: "@pipelab/plugin-system",
                    nodeId: "log",
                  },
                  params: {
                    message: `File: {{ steps['${listFilesNodeId}']['outputs']['paths'] }}`,
                  },
                  uid: "log-ok-in-foreach",
                },
              ],
              branchFalse: [
                {
                  type: "action",
                  origin: {
                    pluginId: "@pipelab/plugin-system",
                    nodeId: "log",
                  },
                  params: {
                    message: `Folder: {{ steps['${listFilesNodeId}']['outputs']['paths'] }}`,
                  },
                  uid: "log-ko-in-foreach",
                },
              ],
            },
          ],
          uid: "for-each-file",
        },
        {
          type: "action",
          origin: {
            pluginId: "@pipelab/plugin-system",
            nodeId: "log",
          },
          uid: logOkId,
          params: {
            message: "{{ Filesystem.Join() }}",
          },
        },
      ],
    },
  };

  return {
    data,
  };
};
