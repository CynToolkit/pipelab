const { FusesPlugin } = require('@electron-forge/plugin-fuses')
const { FuseV1Options, FuseVersion } = require('@electron/fuses')

const CynPlugin = require('./cyn-plugin')

/**
 * @type {import('@electron-forge/shared-types').ForgeConfig}
 */
module.exports = {
  outDir: './out',
  packagerConfig: {
    asar: true,
    name: '<%= config.name %>',
    appBundleId: '<%= config.appBundleId %>',
    appCopyright: '<%= config.appCopyright %>',
    appVersion: '<%= config.appVersion %>',
    // icon: './assets/icon', // file extension is ommited (auto completed by platform: darwin: icns, linux, win32)
    win32metadata: {
      CompanyName: '<%= config.author %>',
      FileDescription: '<%= config.description %>'
    },
    appCategoryType: '<%= config.appCategoryType %>',
    icon: '<%= config.icon %>'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {}
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {}
    },
    {
      name: '@electron-forge/maker-zip'
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    }),
    new CynPlugin()
  ]
}
