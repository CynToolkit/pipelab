import {
  UpdateStatus,
  RendererChannels,
  RendererData,
  RendererEvents,
  RendererEnd,
  RendererMessage,
  RequestId,
  HandleListenerRendererSendFn,
  HandleListenerRenderer as BaseHandleListenerRenderer,
} from "@pipelab/shared";
export { usePluginAPI } from "@pipelab/shared";
export type { UseMainAPI, ListenerMain } from "@pipelab/shared";

export type {
  UpdateStatus,
  RendererChannels,
  RendererData,
  RendererEvents,
  RendererEnd,
  RendererMessage,
  RequestId,
  HandleListenerRendererSendFn,
};

export type HandleListenerRenderer<KEY extends RendererChannels> = (
  event: Electron.IpcMainInvokeEvent,
  data: { value: RendererData<KEY>; send: HandleListenerRendererSendFn<KEY> },
) => Promise<void>;
