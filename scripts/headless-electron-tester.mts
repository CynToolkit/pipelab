import { execa } from 'execa'
import { join } from 'path'
import { cwd, stdin } from 'process'

await execa({
  cwd: join(import.meta.dirname, '..'),
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit'
})`./assets/electron/template/app/node_modules/.bin/electron-forge start -- --headless --port=3000`
