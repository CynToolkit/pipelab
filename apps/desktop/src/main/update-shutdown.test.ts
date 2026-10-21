import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installUpdateAfterServerStops } from "./update-shutdown";

describe("installUpdateAfterServerStops", () => {
  it("resets the installing state when the updater cannot start", async () => {
    const error = new Error("updater unavailable");
    let installing = false;
    let failure: unknown;

    await installUpdateAfterServerStops({
      stopServer: async () => {},
      quitAndInstall: () => {
        throw error;
      },
      setInstalling: (value) => (installing = value),
      onFailure: (value) => (failure = value),
    });

    assert.equal(installing, false);
    assert.equal(failure, error);
  });

  it("stops the CLI before allowing updater shutdown", async () => {
    const events: string[] = [];

    await installUpdateAfterServerStops({
      stopServer: async () => {
        events.push("stop-server");
      },
      quitAndInstall: () => events.push("quit-and-install"),
      setInstalling: (value) => events.push(`installing:${value}`),
      onFailure: (error) => {
        throw error;
      },
    });

    assert.deepEqual(events, ["stop-server", "installing:true", "quit-and-install"]);
  });
});
