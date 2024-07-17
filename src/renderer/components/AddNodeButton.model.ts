import { CynNode, RendererPluginDefinition } from "../../shared/libs/plugin-core";

export interface AddNodeEvent {
  node: CynNode;
  plugin: RendererPluginDefinition;
  path: string[];
  insertAt: number
}
