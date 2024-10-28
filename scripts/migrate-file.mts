import { savedFileMigrator } from '@@/model'
import * as fs from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { nanoid } from 'nanoid'
import { execa } from 'execa'

const args = process.argv.slice(2)
if (args.length !== 1) {
  console.error('Usage: node script.ts <filepath>')
  process.exit(1)
}

const filePath = args[0]

async function migrateFile() {
  try {
    // const tmpFile = join(tmpdir(), nanoid() + '.json')

    const data = await fs.readFile(filePath, 'utf8')
    const json = JSON.parse(data)
    const migratedData = await savedFileMigrator.migrate(json)
    const str = JSON.stringify(migratedData, null, 2)
    console.log('data', data)
    console.log('str', str)
    await fs.writeFile(filePath, str, 'utf8')
    console.log('File successfully migrated to the latest version of the model.')

    // await execa('delta', [filePath, tmpFile], {
    //   env: {
    //     DELTA_FEATURES: '+side-by-side'
    //   }
    // })
  } catch (error) {
    console.error(`Error migrating the file: ${error}`)
    process.exit(1)
  }
}

await migrateFile()
