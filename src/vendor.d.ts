declare module 'tar' {
  export function extract(options: { cwd: string; strip: number }): import('node:stream').Transform
}

declare module 'serve-handler' {
  type Options = {
    maxAge?: number
    public: string
    headers?: Record<string, string>
  }

  const serveHandler: (
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
    options: Options,
  ) => void

  export default serveHandler
}

declare module 'electron-squirrel-startup' {
  const started: boolean
  export = started
}

declare module 'electron-squirrel-startup' {
  const started: boolean
  export = started
}
