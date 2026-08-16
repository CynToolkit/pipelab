export const stripFirstPathSegment = (name: string): string => {
  const firstSlashIndex = name.indexOf('/')
  if (firstSlashIndex === -1) {
    return name
  }
  return name.substring(firstSlashIndex + 1)
}

const assertSafeTarget = (name: string): void => {
  if (name.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Refusing to extract entry with an unsafe path: ${name}`)
  }
}

const extractZipEntries = async (
  zipPath: string,
  destinationDir: string,
  transform: (name: string) => string
): Promise<void> => {
  const StreamZip = await import('node-stream-zip')
  const { mkdir } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')

  const zip = new StreamZip.default.async({ file: zipPath })
  try {
    const entries = await zip.entries()
    for (const name of Object.keys(entries)) {
      const entry = entries[name]
      const target = transform(name)
      assertSafeTarget(target)
      if (entry.isDirectory) {
        await mkdir(join(destinationDir, target), { recursive: true })
        continue
      }
      const outPath = join(destinationDir, target)
      await mkdir(dirname(outPath), { recursive: true })
      await zip.extract(name, outPath)
    }
  } finally {
    await zip.close()
  }
}

export const extractZip = (zipPath: string, destinationDir: string): Promise<void> =>
  extractZipEntries(zipPath, destinationDir, (name) => name)

export const extractZipStripFirst = (zipPath: string, destinationDir: string): Promise<void> =>
  extractZipEntries(zipPath, destinationDir, stripFirstPathSegment)
