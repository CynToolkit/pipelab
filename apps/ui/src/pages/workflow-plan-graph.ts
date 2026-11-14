import { plannedUsedTargetKeys, usedTargetKeys } from "@pipelab/shared";
import type { IconType, ReleaseCatalog, ReleaseConfig, ReleasePlan } from "@pipelab/shared";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";
import { destinationIcon, providerMetadataIcon, sourceIcon } from "../utils/provider-icons";

export type PlanNodeKind = "source" | "build" | "automatic" | "destination";

export interface PlanGraphNode {
  id: string;
  kind: PlanNodeKind;
  label: string;
  detail?: string;
  icon?: IconType;
  x: number;
  y: number;
}

export interface PlanGraphEdge {
  id: string;
  from: string;
  to: string;
  /** Start, bends and end of an orthogonal route, in graph coordinates. */
  points: Array<{ x: number; y: number }>;
}

export interface PlanGraphLayout {
  nodes: PlanGraphNode[];
  edges: PlanGraphEdge[];
  width: number;
  height: number;
}

type IconProviders = Parameters<typeof destinationIcon>[0];

export const PLAN_NODE_WIDTH = 232;
export const PLAN_NODE_HEIGHT = 60;
const PADDING = 16;

const nodeCopy = (
  node: ReleasePlan["graph"]["nodes"][number],
  config: ReleaseConfig,
  catalog: ReleaseCatalog | undefined,
  providers: IconProviders,
  plan?: ReleasePlan,
): { label: string; detail?: string; icon?: IconType } => {
  if (node.kind === "source") {
    const source = catalog?.sources.find((item) => item.id === config.source.provider);
    return {
      label: source?.label ?? "Source",
      detail: "Source",
      icon: sourceIcon(providers, source),
    };
  }
  if (node.kind === "build") {
    const build = config.builds.find((item) => item.id === node.id);
    const producer = catalog?.producers.find((item) => item.id === build?.engine);
    const used = plan ? plannedUsedTargetKeys(plan) : usedTargetKeys(config);
    const targets = build?.targets
      ?.filter((target) => used.has(`${build.id}:${target.id}`))
      .map((target) => target.id);
    return {
      label: build?.name || producer?.label || node.id,
      detail: targets?.length ? targets.join(", ") : producer?.label,
      icon: producer?.icon ?? providerMetadataIcon(providers, build?.engine ?? ""),
    };
  }
  if (node.kind === "automatic") {
    return {
      label: "Automatic step",
      detail: "Added by the planner",
      icon: { type: "icon", icon: "mdi mdi-auto-fix" },
    };
  }
  const [destinationId, ...rest] = node.id.split(":");
  const slotId = rest.join(":");
  const destination = config.destinations.find((item) => item.id === destinationId);
  const definition = catalog?.destinations.find((item) => item.id === destination?.provider);
  const slot = destination?.slots.find((item) => item.id === slotId);
  const label = destination?.name || definition?.label || destinationId || node.id;
  const detail =
    slot?.name || (slot?.input && "targetId" in slot.input ? slot.input.targetId : undefined);
  return {
    label,
    detail: detail && detail !== label ? detail : undefined,
    icon: destinationIcon(providers, destination?.provider ?? "", definition?.icon),
  };
};

const PARTITION: Record<PlanNodeKind, number> = {
  source: 0,
  build: 1,
  automatic: 1,
  destination: 2,
};

/**
 * Layered left-to-right layout by ELK with orthogonal edge routing. Partitions keep every
 * source before every build and every build before every destination, so destinations share
 * the last column while chained builds still get a column each.
 */
export const layoutPlanGraph = async (
  graph: ReleasePlan["graph"],
  config: ReleaseConfig,
  catalog?: ReleaseCatalog,
  providers: IconProviders = [],
  plan?: ReleasePlan,
): Promise<PlanGraphLayout> => {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const known = new Set(graph.nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => known.has(edge.from) && known.has(edge.to));

  const input: ElkNode = {
    id: "plan",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.partitioning.activate": "true",
      "elk.spacing.nodeNode": "20",
      "elk.spacing.edgeEdge": "10",
      "elk.spacing.edgeNode": "20",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "10",
      "elk.layered.mergeEdges": "true",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": `[top=${PADDING},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: PLAN_NODE_WIDTH,
      height: PLAN_NODE_HEIGHT,
      layoutOptions: { "elk.partitioning.partition": String(PARTITION[node.kind]) },
    })),
    edges: edges.map((edge, index) => ({
      id: `e${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };
  const laidOut = await new ELK().layout(input);

  const positions = new Map((laidOut.children ?? []).map((child) => [child.id, child]));
  const nodes: PlanGraphNode[] = graph.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    ...nodeCopy(node, config, catalog, providers, plan),
    x: positions.get(node.id)?.x ?? 0,
    y: positions.get(node.id)?.y ?? 0,
  }));
  const routed = new Map(
    ((laidOut.edges ?? []) as ElkExtendedEdge[]).map((edge) => [edge.id, edge]),
  );
  return {
    nodes,
    edges: edges.map((edge, index) => {
      const section = routed.get(`e${index}`)?.sections?.[0];
      return {
        id: `${edge.from}>${edge.to}`,
        from: edge.from,
        to: edge.to,
        points: section
          ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
          : [],
      };
    }),
    width: laidOut.width ?? 0,
    height: laidOut.height ?? 0,
  };
};
