import {
  createExpression,
  createExpressionRunner,
} from "@pipelab/plugin-core";

export const ID = "join";

export type Data = {
  value: string;
};

const DEFAULT_SEPARATOR = ", ";

export const join = createExpression({
  id: ID,
  name: "Join",
  description: 'Join values',
  displayString: 'Join {{ params.value }}',
  icon: '',
  meta: {},
  params: {
    input: {
      label: 'Input',
      value: [],
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
    separator: {
      label: 'Separator',
      value: DEFAULT_SEPARATOR,
      control: {
        type: 'input',
        options: {
          kind: 'text'
        }
      }
    },
  },

  outputs: {
    value: {
      label: 'Value',
      value: ''
    },
  },
});

export const evaluator = createExpressionRunner<typeof join>(async ({ inputs }) => {
    const inputArr = inputs?.input;
    const separatorArr = inputs?.separator;

    const input = inputArr ? inputArr[0] : [];
    const separator = separatorArr?.[0] ?? DEFAULT_SEPARATOR;

    const result = input.join(separator)
    return result
  }
);