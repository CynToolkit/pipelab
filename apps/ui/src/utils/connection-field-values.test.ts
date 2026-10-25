import { describe, expect, it } from "vitest";
import type { IntegrationField } from "@pipelab/shared";
import {
  connectionIntegrationFieldValue,
  serializeConnectionIntegrationValues,
} from "./connection-field-values";

describe("Connection integration fields", () => {
  it("stores provider declared keys without trimming their values", () => {
    const fields: IntegrationField[] = [
      { key: "sessionToken", label: "Session token", type: "password" },
      { key: "accountName", label: "Account name", type: "text" },
    ];

    expect(
      serializeConnectionIntegrationValues(fields, {
        sessionToken: " token with spaces ",
        accountName: "Release account",
        unrelated: "not saved",
      }),
    ).toEqual({ sessionToken: " token with spaces ", accountName: "Release account" });
  });

  it("reads only provider declared field keys", () => {
    const connection = {
      email: "legacy-user",
      apiKey: "legacy-token",
      username: "provider-user",
      token: "provider-token",
    };

    expect(connectionIntegrationFieldValue(connection, "username")).toBe("provider-user");
    expect(connectionIntegrationFieldValue(connection, "token")).toBe("provider-token");
    expect(connectionIntegrationFieldValue({ email: "legacy-user" }, "username")).toBe("");
    expect(connectionIntegrationFieldValue({ apiKey: "legacy-token" }, "token")).toBe("");
    expect(connectionIntegrationFieldValue({ api_key: "legacy-token" }, "token")).toBe("");
  });
});
