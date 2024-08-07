import { Logger } from 'tslog'
import { isRenderer } from './validation'
import { usePluginAPI } from '@main/api'
import { BrowserWindow } from 'electron'

const createDefaultLogger = () =>
  new Logger({
    minLevel: 3, // INFO
    hideLogPositionForProduction: false
  })

let _logger = createDefaultLogger()
// let _mainWindow: BrowserWindow | undefined = undefined

export const useLogger = () => {
  const setMainWindow = (mainWindow: BrowserWindow) => {
    // _mainWindow = mainWindow
    _logger = createDefaultLogger()

    // in main, send logs to renderer
    if (!isRenderer()) {
      _logger.attachTransport((logObj) => {
        const api = usePluginAPI(mainWindow)
        api.execute('log:message', logObj)
      })
    }
  }

  return {
    logger: () => _logger,
    setMainWindow
  }
}
