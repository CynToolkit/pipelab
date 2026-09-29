export const workflowTaskOutputLines = (message: string) =>
  message.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
