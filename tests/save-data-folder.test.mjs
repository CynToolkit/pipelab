import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { resolveSaveDataFolder } from '../assets/electron/template/app/src/handlers/user/save-data-folder.js'

const appNameFolder = 'com.example.game'

test('Linux uses XDG_DATA_HOME for save data', () => {
  assert.equal(
    resolveSaveDataFolder({
      platform: 'linux',
      env: { XDG_DATA_HOME: '/custom/data' },
      homePath: '/home/player',
      appDataPath: '/home/player/.config',
      appNameFolder,
    }),
    '/custom/data/com.example.game',
  )
})

test('Linux defaults to ~/.local/share when XDG_DATA_HOME is unset or empty', () => {
  for (const env of [{}, { XDG_DATA_HOME: '' }]) {
    assert.equal(
      resolveSaveDataFolder({
        platform: 'linux',
        env,
        homePath: '/home/player',
        appDataPath: '/home/player/.config',
        appNameFolder,
      }),
      '/home/player/.local/share/com.example.game',
    )
  }
})

test('Linux defaults to ~/.local/share when XDG_DATA_HOME is not absolute', () => {
  assert.equal(
    resolveSaveDataFolder({
      platform: 'linux',
      env: { XDG_DATA_HOME: 'relative/data' },
      homePath: '/home/player',
      appDataPath: '/home/player/.config',
      appNameFolder,
    }),
    '/home/player/.local/share/com.example.game',
  )
})

test('Windows uses Local AppData and keeps the app-specific folder', () => {
  assert.equal(
    resolveSaveDataFolder({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\player\\AppData\\Local' },
      homePath: 'C:\\Users\\player',
      appDataPath: 'C:\\Users\\player\\AppData\\Roaming',
      appNameFolder,
      pathUtils: path.win32,
    }),
    'C:\\Users\\player\\AppData\\Local\\com.example.game',
  )
})

test('Windows falls back to the Local AppData directory under the user home', () => {
  assert.equal(
    resolveSaveDataFolder({
      platform: 'win32',
      env: { LOCALAPPDATA: '' },
      homePath: 'C:\\Users\\player',
      appDataPath: 'C:\\Users\\player\\AppData\\Roaming',
      appNameFolder,
      pathUtils: path.win32,
    }),
    'C:\\Users\\player\\AppData\\Local\\com.example.game',
  )
})

test('macOS uses Electron Application Support and keeps the app-specific folder', () => {
  assert.equal(
    resolveSaveDataFolder({
      platform: 'darwin',
      env: {},
      homePath: '/Users/player',
      appDataPath: '/Users/player/Library/Application Support',
      appNameFolder,
    }),
    '/Users/player/Library/Application Support/com.example.game',
  )
})
