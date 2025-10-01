import { RendererPluginDefinition } from '@pipelab/plugin-core'
import type { Tagged } from 'type-fest'
import { PresetResult, Steps } from './model'
import { AppConfig } from '@main/config'
import {
  BuildHistoryEntry,
  BuildHistoryQuery,
  BuildHistoryResponse,
  BuildHistoryConfig,
  RetentionPolicy
} from './build-history'

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
        code?: string
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

  // Build History APIs
  'build-history:save': [{ entry: BuildHistoryEntry }, EndEvent<{ result: 'ok' | 'ko' }>]
  'build-history:get': [{ id: string }, EndEvent<{ entry?: BuildHistoryEntry }>]
  'build-history:get-all': [{ query?: BuildHistoryQuery }, EndEvent<BuildHistoryResponse>]
  'build-history:update': [
    { id: string; updates: Partial<BuildHistoryEntry> },
    EndEvent<{ result: 'ok' | 'ko' }>
  ]
  'build-history:delete': [{ id: string }, EndEvent<{ result: 'ok' | 'ko' }>]
  'build-history:delete-by-project': [{ projectId: string }, EndEvent<{ result: 'ok' | 'ko' }>]
  'build-history:clear': [void, EndEvent<{ result: 'ok' | 'ko' }>]
  'build-history:get-storage-info': [
    void,
    EndEvent<{
      totalEntries: number
      totalSize: number
      oldestEntry?: number
      newestEntry?: number
    }>
  ]
  'build-history:configure': [
    { config: Partial<BuildHistoryConfig> },
    EndEvent<{ result: 'ok' | 'ko' }>
  ]
  'graph:execute': [
    {
      graph: any[]
      variables: any[]
      projectName?: string
      projectPath?: string
    },
    (
      | { type: 'node-enter'; data: { nodeUid: string; nodeName: string } }
      | { type: 'node-exit'; data: { nodeUid: string; nodeName: string } }
      | { type: 'node-log'; data: { nodeUid: string; logData: any } }
      | EndEvent<{ result: any; buildId: string }>
    )
  ]
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
