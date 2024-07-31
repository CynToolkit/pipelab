import { CynNode, Event, RendererPluginDefinition } from "../../shared/libs/plugin-core";

export interface AddNodeEvent {
  node: CynNode;
  plugin: RendererPluginDefinition;
  path: string[];
  insertAt: number
}

export interface AddTriggerEvent {
  trigger: Event;
  plugin: RendererPluginDefinition;
  path: string[];
  insertAt: number
}
