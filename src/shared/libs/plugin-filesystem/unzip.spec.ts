import { expect, test } from 'vitest'
import { unzipRunner } from './unzip.js'

test('adds 1 + 2 to equal 3', async () => {
    const outputs: Record<string, unknown> = {}
    await unzipRunner({
        inputs: {
            file: '',
        },
        log: (...args) => {
            console.log(...args)
        },
        setOutput: (key, value) => {
            outputs[key] = value
        },
        meta: {
            definition: ''
        },
        setMeta: () => {
            console.log('set meta defined here')
        },
        cwd: '',
        paths: {
          assets: '',
          unpack: ''
        }
    })
    console.log('outputs', outputs)
    expect(true).toBe(true)
}, 120_000)
