import type { ConnectionsConfig, ConnectionsConfigV1, Connection } from "../config.schema";

export type { ConnectionsConfig, ConnectionsConfigV1, Connection };

export interface ConnectionsParseIssue {
  code: "connections.invalid" | "connections.version" | "connections.duplicate-id";
  message: string;
  path?: string;
}

export class ConnectionsParseError extends Error {
  constructor(public readonly issues: ConnectionsParseIssue[]) {
    super(
      issues.map((issue) => `${issue.path ? `${issue.path}: ` : ""}${issue.message}`).join(" "),
    );
    this.name = "ConnectionsParseError";
  }
}

export const parseConnectionsConfig = (value: unknown): ConnectionsConfig => {
  const issues: ConnectionsParseIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConnectionsParseError([
      { code: "connections.invalid", message: "Connections must be an object." },
    ]);
  }
  const record = value as Record<string, unknown>;
  if (record.version !== "1.0.0")
    issues.push({
      code: "connections.version",
      message: "Only connections version 1.0.0 is supported.",
      path: "version",
    });
  if (!Array.isArray(record.connections))
    issues.push({
      code: "connections.invalid",
      message: "connections must be an array.",
      path: "connections",
    });
  const ids = new Set<string>();
  for (const [index, connection] of (Array.isArray(record.connections)
    ? record.connections
    : []
  ).entries()) {
    const path = `connections.${index}`;
    if (typeof connection !== "object" || connection === null || Array.isArray(connection)) {
      issues.push({ code: "connections.invalid", message: "Connection must be an object.", path });
      continue;
    }
    const candidate = connection as Record<string, unknown>;
    for (const key of ["id", "pluginName", "name", "createdAt"])
      if (typeof candidate[key] !== "string" || candidate[key].trim().length === 0)
        issues.push({
          code: "connections.invalid",
          message: `${key} is required.`,
          path: `${path}.${key}`,
        });
    if (typeof candidate.isDefault !== "boolean")
      issues.push({
        code: "connections.invalid",
        message: "isDefault must be a boolean.",
        path: `${path}.isDefault`,
      });
    if (typeof candidate.id === "string") {
      if (ids.has(candidate.id))
        issues.push({
          code: "connections.duplicate-id",
          message: `Connection ID '${candidate.id}' is duplicated.`,
          path: `${path}.id`,
        });
      ids.add(candidate.id);
    }
  }
  if (issues.length > 0) throw new ConnectionsParseError(issues);
  return value as ConnectionsConfig;
};
