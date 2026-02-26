import { createActionRunner } from '@pipelab/plugin-core'
import { createPackageProps, discord } from './discord'
import { merge } from 'ts-deepmerge'
import { defaultTauriConfig } from './utils'
import { basename, join } from 'path'
import { cp } from 'fs/promises'

export const packageV2Runner = createActionRunner<ReturnType<typeof createPackageProps>>(
  async ({ inputs, cwd, paths, log, setOutput }) => {
    const appFolder = inputs['input-folder']

    const { assets, unpack, cache, node, pnpm } = paths
    const destinationFolder = join(cwd)
    const templateFolder = join(assets, 'discord', 'templates', 'nitro-app')

    // copy template to destination
    await cp(templateFolder, destinationFolder, {
      recursive: true,
      filter: (src) => {
        log('src', src)
        // log('dest', dest)
        // TODO: support other oses
        return basename(src) !== 'node_modules' && !src.includes('.nitro') && !src.includes('dist')
      }
    })
    const placeAppFolder = join(destinationFolder, 'server', 'public', '.proxy')
    if (appFolder) {
      // copy app to template
      await cp(appFolder, placeAppFolder, {
        recursive: true
      })
    }

    log('destinationFolder', destinationFolder)

    setOutput('outputDir', destinationFolder)
  }
)
