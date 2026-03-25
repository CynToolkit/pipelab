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
  async packageAfterCopy(config, buildPath, electronVersion, platform, arch) {
    console.log(`Platform: ${platform}`)
    console.log(`Architecture: ${arch}`)
    console.log(`Build path: ${buildPath}`)
    console.log(`Config: ${JSON.stringify(config)}`)
    console.log(`Electron version: ${electronVersion}`)
    const fs = require('fs').promises
    const path = require('path')
    const pkg = require('./package.json')

    console.log('config', config)

    const outputFolder = path.resolve(buildPath, '..', '..')

    // Runtime JSON file

    const pipelabJsonPath = path.join(outputFolder, 'pipelab.json')

    await fs.writeFile(
      pipelabJsonPath,
      JSON.stringify(
        {
          name: config.name || pkg.productName || pkg.name,
          version: config.appVersion || pkg.version,
          description: config.description || pkg.description,
          author: config.author || (typeof pkg.author === 'object' ? pkg.author.name : pkg.author),
          homepage: pkg.homepage,
          engine: 'Pipelab',
          runtimeVersion: pkg.devDependencies['@pipelab/core'],
          buildDate: new Date().toISOString(),
          platform: platform,
          arch: arch,
          electron: electronVersion
        },
        null,
        2
      ),
      'utf8'
    )
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
    const appConfig = require('./config.cjs')

    const outputFolder = result.outputPaths[0]

    // Doctor
    if (result.platform === 'win32' && appConfig.enableDoctor) {
      const appName = config.packagerConfig.name
      console.log('appName', appName)
      const doctorBatContent = `@echo off
pushd "%~dp0"

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

echo 3. Checking DirectX version...
reg query "HKLM\\SOFTWARE\\Microsoft\\DirectX" /v Version >nul 2>&1
if %errorlevel%==0 (
  echo OK: DirectX detected.
) else (
  echo ERROR: DirectX registry key not found.
)
echo.

echo 4. Checking Vulkan...
if exist "%SystemRoot%\\System32\\vulkan-1.dll" (
  echo OK: Vulkan installed.
) else (
  echo WARNING: Vulkan not found.
)
echo.

echo 5. GPU Information:
echo All GPUs:
powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | Format-Table -AutoSize"
echo.

echo All prerequisites met. Starting ${appName}...
echo Logs will be displayed and saved to ${appName.toLowerCase()}-debug.log
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "cmd /c '${appName}.exe --enable-logging 2>&1' | Tee-Object -FilePath '${appName.toLowerCase()}}-debug.log'"

echo.
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ${appName} exited with error code: %ERRORLEVEL%
) else (
    echo ${appName} has exited. Logs saved to ${appName.toLowerCase()}}-debug.log
)

:end
popd
pause`
      const doctorBatPath = path.join(outputFolder, 'doctor.bat')
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
