const { PluginBase } = require('@electron-forge/plugin-base')

module.exports = class PipelabPlugin extends PluginBase {
  getHooks() {
    return {
      prePackage: [this.prePackage],
      generateAssets: [this.generateAssets],
      postStart: [this.postStart],
      packageAfterCopy: [this.packageAfterCopy],
      packageAfterPrune: [this.packageAfterPrune],
      packageAfterExtract: [this.packageAfterExtract],
      postPackage: [this.postPackage],
      preMake: [this.preMake],
      postMake: [this.postMake],
      readPackageJson: [this.readPackageJson]
    }
  }

  prePackage() {
    // console.log('running prePackage hook')
  }
  generateAssets() {
    // console.log('running generateAssets hook')
  }
  postStart() {
    // console.log('running postStart hook')
  }
  packageAfterCopy() {
    // console.log('running packageAfterCopy hook')
  }
  packageAfterPrune() {
    // console.log('running packageAfterPrune hook')
  }
  packageAfterExtract() {
    // console.log('running packageAfterExtract hook')
  }
  async postPackage(config, result) {
    const fs = require('fs').promises
    const path = require('path')

    if (result.platform === 'win32') {
      const appName = config.packagerConfig.name
      console.log('appName', appName)
      const doctorBatContent = `@echo off
echo ${appName} Doctor - Checking prerequisites...
echo.

echo 1. Checking Windows version...
ver | find "10." >nul
if %errorlevel% neq 0 (
  echo ERROR: Windows 10 or later required.
  goto end
)
echo OK: Windows 10 or later detected.
echo.

echo 2. Checking Microsoft Visual C++ Redistributable...
reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" /v Installed >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Microsoft Visual C++ Redistributable 2015-2022 not found.
  goto end
)
echo OK: VC++ Redistributable found.
echo.

echo All prerequisites met. Starting ${appName}...
echo Logs will be displayed and saved to ${appName.toLowerCase()}-debug.log
powershell -command "& { .\\${appName}.exe *>&1 | tee ${appName.toLowerCase()}-debug.log }"
echo.

echo ${appName} has exited. Logs saved to ${appName.toLowerCase()}-debug.log
:end
pause`
      const doctorBatPath = path.join(result.outputPaths[0], 'doctor.bat')
      await fs.writeFile(doctorBatPath, doctorBatContent, 'utf8')
    }
  }
  preMake() {
    // console.log('running preMake hook')
  }
  postMake() {
    // console.log('running postMake hook')
  }
  readPackageJson() {
    // console.log('running readPackageJson hook')
  }
}
