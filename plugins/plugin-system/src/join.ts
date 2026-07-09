import { createExpression, createExpressionRunner } from "@pipelab/plugin-core";

export const ID = "join";

export type Data = {
  value: string;
};

const DEFAULT_SEPARATOR = ", ";

export const join = createExpression({
  id: ID,
  name: "Join",
  description: "Join values",
  displayString: "Join {{ params.value }}",
  icon: "",
  meta: {},
  params: {
    input: {
      required: true,
      label: "Input",
      value: [] as string[],
      control: {
        type: "input",
        options: {
          kind: "text",
        },
      },
    },
    separator: {
      required: true,
      label: "Separator",
      value: DEFAULT_SEPARATOR,
      control: {
        type: "input",
        options: {
          kind: "text",
        },
      },
    },
  },

  outputs: {
    value: {
      label: "Value",
      value: "",
    },
  },
});

export const evaluator = createExpressionRunner<typeof join>(async ({ inputs }) => {
  const input = (inputs?.input ?? []) as unknown as string[];
  const separator = (inputs?.separator ?? DEFAULT_SEPARATOR) as unknown as string;

  const result = input.join(separator);
  return result;
});
