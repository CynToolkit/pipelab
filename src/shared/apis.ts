import { RendererPluginDefinition } from '@pipelab/plugin-core'
import type { Tagged } from 'type-fest'
import { PresetResult, Steps } from './model'
import { AppConfig } from '@main/config'

type Event<TYPE extends string, DATA> =
  | { type: TYPE; data: DATA }
  | { type: 'log'; data: { decorator: string; message: unknown[]; time: number } }
type EndEvent<DATA> = {
  type: 'end'
  data:
    | {
        type: 'success'
        result: DATA
      }
    | {
        type: 'error'
        ipcError: string
      }
}

export type Presets = Record<string, PresetResult>

export type IpcDefinition = {
  'fs:read': [
    // input
    { path: string },
    EndEvent<{ content: string }>
  ]
  'fs:remove': [
    // input
    { path: string },
    EndEvent<boolean>
  ]
  'fs:write': [
    // input
    {
      path: string
      content: string
    },
    EndEvent<{ ok: boolean }>
  ]
  'fs:rm': [
    // input
    {
      path: string
      recursive: boolean
      force: boolean
    },
    EndEvent<{ ok: boolean }>
  ]
  'settings:reset': [
    // input
    { key: keyof AppConfig },
    EndEvent<{ result: string }>
  ]
  'dialog:showOpenDialog': [
    // input
    Electron.OpenDialogOptions,
    EndEvent<{ canceled: boolean; filePaths: string[] }>
  ]
  'dialog:showSaveDialog': [
    // input
    Electron.SaveDialogOptions,
    EndEvent<{ canceled: boolean; filePath: string | undefined }>
  ]
  'nodes:get': [void, EndEvent<{ nodes: RendererPluginDefinition[] }>]
  'presets:get': [void, EndEvent<Presets>]
  'action:execute': [
    {
      pluginId: string
      nodeId: string
      params: any
      steps: Steps
    },
    (
      | Event<'progress', unknown>
      | Event<'progress', unknown>
      | EndEvent<{ outputs: Record<string, unknown>; tmp: string }>
    )
  ]
  'condition:execute': [
    {
      pluginId: string
      nodeId: string
      params: any
      steps: Steps
    },
    (
      | Event<'progress', unknown>
      | Event<'progress', unknown>
      | EndEvent<{ outputs: Record<string, unknown>; value: boolean }>
    )
  ]
  'constants:get': [void, EndEvent<{ result: { userData: string } }>]

  'config:load': [{ config: string }, EndEvent<{ result: any }>]
  'config:save': [{ data: string; config: string }, EndEvent<{ result: 'ok' }>]
  'action:cancel': [void, EndEvent<{ result: 'ok' | 'ko' }>]
  'settings:load': [never, EndEvent<{ result: AppConfig }>]
  'settings:save': [AppConfig, EndEvent<{ result: 'ok' | 'ko' }>]
}

export type Channels = keyof IpcDefinition
export type Data<KEY extends Channels> = IpcDefinition[KEY][0]
export type Events<KEY extends Channels> = IpcDefinition[KEY][1]
export type End<KEY extends Channels> = Extract<IpcDefinition[KEY][1], { type: 'end' }>['data']

export type Message = {
  // the channel to communicate
  requestId: RequestId
  data: any
}
export type RequestId = Tagged<string, 'request-id'>

// type Output = End<'fs:openFolder'>
