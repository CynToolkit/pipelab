import { RendererPluginDefinition } from '@pipelab/plugin-core'
import type { Tagged } from 'type-fest'
import { Preset, Steps } from './model'

type Event<TYPE extends string, DATA> = { type: TYPE; data: DATA }
type EndEvent<DATA> = { type: 'end'; data: DATA }

export type Presets = Record<string, { data: Preset }>

export type IpcDefinition = {
  'fs:read': [
    // input
    { path: string },
    EndEvent<{ content: string }> | EndEvent<{ result: any }>
  ]
  'fs:write': [
    // input
    {
      path: string
      content: string
    },
    EndEvent<{ ok: boolean }>
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
      | EndEvent<{ outputs: Record<string, unknown> }>
      | EndEvent<{ result: any }>
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
      | EndEvent<{ result: any }>
    )
  ]
  'constants:get': [void, EndEvent<{ result: { userData: string } }>]

  'config:load': [{ config: string }, EndEvent<{ result: any }>]
  'config:save': [{ data: string; config: string }, EndEvent<{ result: 'ok' }>]
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
