import type { Tagged } from "type-fest";
import type { ILogObjMeta } from "tslog";

export type UpdateStatus =
  | "update-available"
  | "update-downloaded"
  | "checking-for-update"
  | "update-not-available"
  | "error";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type IpcEvent<TYPE extends string, DATA> = { type: TYPE; data: DATA };
export type EndEvent<DATA> = {
  type: "end";
  data:
    | {
        type: "success";
        result: DATA;
      }
    | {
        type: "error";
        ipcError: string;
      };
};

export type IpcDefinition = {
  "dialog:alert": [
    // input
    { message: string; buttons?: { title: string; value: string }[] },
    EndEvent<{ answer: string }>,
  ];
  "dialog:prompt": [
    // input
    { message: string; buttons?: { title: string; value: string }[] },
    EndEvent<{ answer: string }>,
  ];
  "log:message": [
    // input
    ILogObjMeta,
    EndEvent<void>,
  ];
  "update:set-status": [
    // input
    {
      status: UpdateStatus;
    },
    EndEvent<void>,
  ];
};

export type RendererChannels = keyof IpcDefinition;
export type RendererData<KEY extends RendererChannels> = IpcDefinition[KEY][0];
export type RendererEvents<KEY extends RendererChannels> = IpcDefinition[KEY][1];
export type RendererEnd<KEY extends RendererChannels> = Extract<
  IpcDefinition[KEY][1],
  { type: "end" }
>["data"];

export type RendererMessage = {
  // the channel to communicate
  requestId: RequestId;
  data: any;
};
export type RequestId = Tagged<string, "request-id">;

export type HandleListenerRendererSendFn<KEY extends RendererChannels> = (
  events: RendererEvents<KEY>,
) => void;

export type HandleListenerRenderer<KEY extends RendererChannels> = (
  event: any,
  data: { value: RendererData<KEY>; send: HandleListenerRendererSendFn<KEY> },
) => Promise<void>;
