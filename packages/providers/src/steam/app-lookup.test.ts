import { describe, expect, it } from "vitest";
import { parseSteamAppDepots } from "./preflight";

const known = `AppID : 42, change number : 1/1, last change : x
"42"
{
	"common"
	{
		"name"		"Game"
	}
	"depots"
	{
		"43"
		{
			"manifests" { "public" "1" }
		}
		"44"
		{
		}
		"baselanguages"		"english"
	}
}`;

describe("parseSteamAppDepots", () => {
  it("lists the app's depots", () => {
    expect(parseSteamAppDepots(known, "42")).toEqual(["43", "44"]);
  });
  it("treats an empty block as an app the account cannot see", () => {
    expect(parseSteamAppDepots('AppID : 7, change number : 1/1\n"7"\n{\n}\n', "7")).toBeUndefined();
  });
  it("treats missing output as unknown app", () => {
    expect(parseSteamAppDepots("", "42")).toBeUndefined();
  });
});
