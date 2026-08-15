import { expect, test } from 'vitest'
import { gpupatchAssetName } from './gpupatch.js'

test('maps supported host platforms and architectures to gpupatch assets', () => {
  expect(gpupatchAssetName('win32', 'x64')).toBe('gpupatch-cli-x86_64-pc-windows-msvc.exe')
  expect(gpupatchAssetName('linux', 'x64')).toBe('gpupatch-cli-x86_64-unknown-linux-gnu')
  expect(gpupatchAssetName('darwin', 'x64')).toBe('gpupatch-cli-x86_64-apple-darwin')
  expect(gpupatchAssetName('darwin', 'arm64')).toBe('gpupatch-cli-aarch64-apple-darwin')
})

test('throws for unsupported platforms and architectures', () => {
  expect(() => gpupatchAssetName('linux', 'arm64')).toThrow()
  expect(() => gpupatchAssetName('win32', 'ia32')).toThrow()
  expect(() => gpupatchAssetName('win32', 'arm64')).toThrow()
  expect(() => gpupatchAssetName('freebsd', 'x64')).toThrow()
})
