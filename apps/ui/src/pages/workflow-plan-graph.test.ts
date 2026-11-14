import { describe, expect, it } from "vitest";
import type { ReleaseConfig, ReleasePlan } from "@pipelab/shared";
import { layoutPlanGraph, PLAN_NODE_HEIGHT, PLAN_NODE_WIDTH } from "./workflow-plan-graph";

const config = {
  source: { provider: "construct" },
  builds: [
    {
      id: "b1",
      name: "Desktop",
      engine: "electron",
      targets: [{ id: "windows-x64" }, { id: "linux-x64" }],
    },
    { id: "b2", engine: "electron", targets: [] },
  ],
  destinations: [
    {
      id: "d1",
      provider: "steam",
      name: "Steam",
      enabled: true,
      slots: [
        {
          id: "s1",
          name: "Beta",
          enabled: true,
          input: { buildId: "b1", targetId: "windows-x64" },
        },
        { id: "s2" },
      ],
    },
  ],
} as unknown as ReleaseConfig;

const graph: ReleasePlan["graph"] = {
  nodes: [
    { id: "source", kind: "source" },
    { id: "b1", kind: "build" },
    { id: "b2", kind: "build" },
    { id: "d1:s1", kind: "destination" },
    { id: "d1:s2", kind: "destination" },
  ],
  edges: [
    { from: "source", to: "b1" },
    { from: "source", to: "b2" },
    { from: "b1", to: "d1:s1" },
    { from: "source", to: "d1:s2" },
  ],
};

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x < b.x + PLAN_NODE_WIDTH &&
  b.x < a.x + PLAN_NODE_WIDTH &&
  a.y < b.y + PLAN_NODE_HEIGHT &&
  b.y < a.y + PLAN_NODE_HEIGHT;

describe("layoutPlanGraph", () => {
  it("labels nodes from the config", async () => {
    const { nodes } = await layoutPlanGraph(graph, config);
    expect(nodes.find((n) => n.id === "b1")).toMatchObject({
      label: "Desktop",
      detail: "windows-x64",
    });
    expect(nodes.find((n) => n.id === "d1:s1")).toMatchObject({ label: "Steam", detail: "Beta" });
  });

  it("orders source, builds and destinations left to right, destinations sharing a column", async () => {
    const { nodes } = await layoutPlanGraph(graph, config);
    const x = (id: string) => nodes.find((n) => n.id === id)!.x;
    expect(x("source")).toBeLessThan(x("b1"));
    expect(x("b1")).toBeLessThan(x("d1:s1"));
    expect(x("d1:s1")).toBe(x("d1:s2"));
  });

  it("never overlaps two cards", async () => {
    const { nodes } = await layoutPlanGraph(graph, config);
    for (const [i, a] of nodes.entries())
      for (const b of nodes.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
  });

  it("routes every edge with right angles only", async () => {
    const { edges } = await layoutPlanGraph(graph, config);
    expect(edges).toHaveLength(4);
    for (const edge of edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < edge.points.length; i++) {
        const [a, b] = [edge.points[i - 1]!, edge.points[i]!];
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });

  it("drops edges that point at unknown nodes", async () => {
    const { edges } = await layoutPlanGraph(
      { nodes: graph.nodes, edges: [...graph.edges, { from: "ghost", to: "b1" }] },
      config,
    );
    expect(edges).toHaveLength(4);
  });
});
