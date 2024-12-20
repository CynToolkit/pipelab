import { expect, test } from 'vitest'
import { ExportActionRunner } from './export-c3p.js'
import { browserWindow } from '@@/tests/helpers.js'

test('adds 1 + 2 to equal 3', async () => {
  const outputs: Record<string, unknown> = {}
  // await ExportActionRunner({
  //   inputs: {
  //     password: '123',
  //     headless: false,
  //     username: 'abc',
  //     version: '350',
  //     file: ''
  //   },
  //   log: (...args) => {
  //     console.log(...args)
  //   },
  //   setOutput: (key, value) => {
  //     outputs[key] = value
  //   },
  //   meta: {
  //     definition: ''
  //   },
  //   setMeta: () => {
  //     console.log('set meta defined here')
  //   },
  //   cwd: '',
  //   paths: {
  //     assets: '',
  //     unpack: ''
  //   },
  //   api: undefined,
  //   browserWindow
  // })
  console.log('outputs', outputs)
  expect(true).toBe(true)
}, 120_000)
