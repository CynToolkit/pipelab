// import { demoPreset } from './demo'
// import { testC3Unzip } from './test-c3-unzip'
// import { testC3Offline } from './test-c3-offline'
import { c3toSteamPreset } from "./c3toSteam";
import { newProjectPreset } from "./newProject";
import { moreToCome } from "./moreToCome";

export const presets = async () => {
  const newProjectVal = await newProjectPreset();
  const c3toSteamVal = await c3toSteamPreset();
  const moreToComeVal = await moreToCome();

  // const demoPresetVal = await demoPreset()
  // const testC3UnzipVal = await testC3Unzip()
  // const testC3OfflineVal = await testC3Offline()
  return {
    newProject: newProjectVal,
    c3toSteam: c3toSteamVal,
    moreToCome: moreToComeVal,
    // demo: demoPresetVal,
    // testC3Unzip: testC3UnzipVal,
    // testC3Offline: testC3OfflineVal,
  };
};
