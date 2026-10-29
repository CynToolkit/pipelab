export const workflowTaskOutputLines = (message: string) =>
  message.split(/\r\n|\n|\r/).filter((line) => line.length > 0);

export const createWorkflowTaskOutputBuffer = () => {
  let pending = "";

  return {
    push(message: string) {
      const lines = `${pending}${message}`.split(/\r\n|\n|\r/);
      pending = lines.pop() || "";
      return lines.filter((line) => line.length > 0);
    },
    flush() {
      const line = pending;
      pending = "";
      return line ? [line] : [];
    },
  };
};
