import { Logger } from 'tslog'
import { isRenderer } from './validation'

const createDefaultLogger = () =>
  new Logger({
    minLevel: 3, // INFO
    hideLogPositionForProduction: false
  })

let _logger = createDefaultLogger()

export const useLogger = () => {
  const setMainWindow = async (mainWindow: any) => {
    _logger = createDefaultLogger()

    // in main, send logs to renderer
    if (!isRenderer()) {
      const { usePluginAPI } = await import('@pipelab/core-node')
      _logger.attachTransport((logObj) => {
        const api = usePluginAPI(mainWindow)
        api.execute('log:message', logObj as any)
      })
    }
  }

  return {
    logger: () => _logger,
    setMainWindow
  }
}
