import type {
  ConnectionsConfig,
  ConnectionsConfigV1,
  Connection,
  WorkflowConnectionBinding,
} from "../config.schema";

export type { ConnectionsConfig, ConnectionsConfigV1, Connection, WorkflowConnectionBinding };

export interface ConnectionsParseIssue {
  code:
    | "connections.invalid"
    | "connections.version"
    | "connections.duplicate-id"
    | "connections.binding"
    | "connections.duplicate-binding";
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

const assertConnectionsConfig: (value: unknown) => asserts value is ConnectionsConfig = (value) => {
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
    if (
      candidate.integrationName !== undefined &&
      (typeof candidate.integrationName !== "string" ||
        candidate.integrationName.trim().length === 0)
    )
      issues.push({
        code: "connections.invalid",
        message: "integrationName must be a non-empty string when present.",
        path: `${path}.integrationName`,
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

  if (record.workflowBindings !== undefined && !Array.isArray(record.workflowBindings))
    issues.push({
      code: "connections.binding",
      message: "workflowBindings must be an array.",
      path: "workflowBindings",
    });
  const connectionIds = new Set(
    (Array.isArray(record.connections) ? record.connections : []).flatMap((connection) => {
      if (typeof connection !== "object" || connection === null || Array.isArray(connection))
        return [];
      const id = (connection as Record<string, unknown>).id;
      return typeof id === "string" ? [id] : [];
    }),
  );
  const bindingKeys = new Set<string>();
  for (const [index, binding] of (Array.isArray(record.workflowBindings)
    ? record.workflowBindings
    : []
  ).entries()) {
    const path = `workflowBindings.${index}`;
    if (typeof binding !== "object" || binding === null || Array.isArray(binding)) {
      issues.push({
        code: "connections.binding",
        message: "Workflow connection binding must be an object.",
        path,
      });
      continue;
    }
    const candidate = binding as Record<string, unknown>;
    if (typeof candidate.workflowId !== "string" || !candidate.workflowId.trim())
      issues.push({
        code: "connections.binding",
        message: "workflowId must be a non-empty string.",
        path: `${path}.workflowId`,
      });
    if (typeof candidate.alias !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(candidate.alias))
      issues.push({
        code: "connections.binding",
        message:
          "alias must start with a letter or underscore and contain only letters, numbers, underscores, or hyphens.",
        path: `${path}.alias`,
      });
    if (typeof candidate.connectionId !== "string" || !candidate.connectionId.trim())
      issues.push({
        code: "connections.binding",
        message: "connectionId must be a non-empty string.",
        path: `${path}.connectionId`,
      });
    else if (!connectionIds.has(candidate.connectionId))
      issues.push({
        code: "connections.binding",
        message: `Connection '${candidate.connectionId}' does not exist.`,
        path: `${path}.connectionId`,
      });

    if (typeof candidate.workflowId === "string" && typeof candidate.alias === "string") {
      const key = `${candidate.workflowId}\u0000${candidate.alias}`;
      if (bindingKeys.has(key))
        issues.push({
          code: "connections.duplicate-binding",
          message: `Workflow '${candidate.workflowId}' has duplicate connection alias '${candidate.alias}'.`,
          path: `${path}.alias`,
        });
      bindingKeys.add(key);
    }
  }

  if (issues.length > 0) throw new ConnectionsParseError(issues);
};

export const parseConnectionsConfig = (value: unknown): ConnectionsConfig => {
  assertConnectionsConfig(value);
  return value;
};
