import { Logger } from 'tslog'

const logger = new Logger({
  minLevel: 3, // INFO
  hideLogPositionForProduction: false,
})

export {
  logger
}
