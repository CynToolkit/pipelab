import { Logger } from "tslog";

const createDefaultLogger = () =>
  new Logger({
    minLevel: 3, // INFO
    hideLogPositionForProduction: false,
  });

let _logger = createDefaultLogger();

export const useLogger = () => {
  const attachTransport = (transport: (logObj: unknown) => void) => {
    _logger.attachTransport(transport as any);
  };

  return {
    logger: () => _logger,
    attachTransport,
  };
};
