import { demoPreset } from './demo'
import { ifPreset } from './if'
import { loopPreset } from './loop'
import { testC3Unzip } from './test-c3-unzip'
import { testC3Offline } from './test-c3-offline'
import { newProjectPreset } from './newProject'

export const presets = async () => {
  const demoPresetVal = await demoPreset()
  const ifPresetVal = await ifPreset()
  const loopPresetVal = await loopPreset()
  const newProjectVal = await newProjectPreset()
  const testC3UnzipVal = await testC3Unzip()
  const testC3OfflineVal = await testC3Offline()
  return {
    newProject: newProjectVal,
    demo: demoPresetVal,
    if: ifPresetVal,
    loop: loopPresetVal,
    testC3Unzip: testC3UnzipVal,
    testC3Offline: testC3OfflineVal,
  }
}
