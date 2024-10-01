export const name = 'Pipelab'

export const outFolderName = (binName: string, platform: NodeJS.Platform, arch: NodeJS.Architecture) => {
  let platformName = ''
  let archName = ''

  if (platform === 'linux') {
    platformName = 'linux'
  } else if (platform === 'win32') {
    platformName = 'win32'
  } else if (platform === 'darwin') {
    platformName = 'darwin'
  } else {
    throw new Error('Unsupported platform')
  }

  if (arch === 'x64') {
    archName = 'x64'
  } else if (arch === 'arm') {
    archName = 'arm'
  } else if (arch === 'arm64') {
    archName = 'arm64'
  } else if (arch === 'ia32') {
    archName = 'ia32'
  } else {
    throw new Error('Unsupported architecture')
  }

  return `${binName}-${platformName}-${archName}`
}
