import type { IntegrationField } from "@pipelab/shared";

export const serializeConnectionIntegrationValues = (
  fields: IntegrationField[],
  values: Record<string, string>,
) => Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ""]));

export const connectionIntegrationFieldValue = (
  connection: Record<string, unknown>,
  key: string,
) => {
  const exact = connection[key];
  if (typeof exact === "string") return exact;
  return "";
};
