// THIS IS STUB DEFINITION
// WILL BE REPLACED ON BUILD

/**
 * @typedef {Object} Config
 *
 * @property {boolean} enableInProcessGPU
 * @property {boolean} enableDisableRendererBackgrounding
 * @property {number} width
 * @property {number} height
 * @property {boolean} fullscreen
 * @property {boolean} frame
 * @property {boolean} transparent
 * @property {boolean} toolbar
 * @property {boolean} alwaysOnTop
 * @property {string} name
 * @property {string} appBundleId
 * @property {string} appCopyright
 * @property {string} appVersion
 * @property {string} author
 * @property {string} description
 * @property {string} appCategoryType
 * @property {string} icon
 * @property {boolean} disableAsarPackaging
 * @property {boolean} enableSteamSupport
 * @property {number} steamGameId
 */

/** @type {Config} */
const config = {
  alwaysOnTop: false,
  appBundleId: 'com.pipelab.app',
  appCategoryType: '',
  appCopyright: 'Copyright © 2024 Pipelab',
  appVersion: '1.0.0',
  author: 'Pipelab',
  customMainCode: '',
  description: 'A simple Electron application',
  electronVersion: '',
  disableAsarPackaging: false,
  enableDisableRendererBackgrounding: false,
  enableInProcessGPU: false,
  frame: true,
  fullscreen: false,
  icon: '',
  height: 600,
  name: 'Pipelab',
  toolbar: true,
  transparent: false,
  width: 800,
  enableSteamSupport: false,
  steamGameId: 480
}

module.exports = config
