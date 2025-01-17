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
  postPackage() {
    // console.log('running postPackage hook')
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
