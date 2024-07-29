import { createAction, createActionRunner } from "@cyn/plugin-core";

export const ID = "itch-upload";

export const uploadToItch = createAction({
  id: ID,
  name: "Upload to Itch.io",
  description: "",
  icon: "",
  displayString: 'TODO',
  meta: {},
  params: {
    "input-folder": {
      label: "Folder to Upload",
      value: '',
      control: {
        type: 'path',
        options: {
          properties: ['openDirectory']
        }
      }
    },
    project: {
      label: "Project",
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    channel: {
      label: "Channel",
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    "api-key": {
      label: "API key",
      value: '',
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
  },
  outputs: {
  },
});

export const uploadToItchRunner = createActionRunner(async ({ log }) => {
  log("uploading to itch");
})
