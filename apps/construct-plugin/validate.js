import config from "./src/pluginConfig.js";
import { exit } from "process";

/**
 *
 * @param {*} name
 * @param {*} obj
 * @param {'action' | 'condition' | 'expression'} aceType
 * @returns
 */
function validateDisplayText(name, obj, aceType) {
  // check if obj has displayText property
  if (obj.hasOwnProperty("displayText")) {
    const paramCount = (obj.params || []).length;
    // use regex to find the number of {/d} in displayText
    const regex = /{\d}/g;
    const matches = obj.displayText.match(regex);
    const matchCount = matches ? matches.length : 0;
    // check if the number of {/d} matches the number of params
    if (paramCount !== matchCount) {
      console.log(
        `Error: ${name} has ${matchCount} {x} in displayText but has ${paramCount} params`
      );
      return false; // validation failed
    }
  }
  return true; // validation passed
}

/**
 *
 * @param {*} name
 * @param {*} obj
 * @param {'action' | 'condition' | 'expression'} aceType
 * @returns
 */
async function ensureForwardScript(name, obj, aceType) {
  const file = await import('./src/instance.js')
  const fileClass = file.getInstanceJs(class {
    _getInitProperties() {
      return {
        // data to be saved for savegames
      };
    }
  }, undefined, undefined)
  const instance = new fileClass()

  if (obj.handler) {
    return true
  }

  if (!(obj.forward in instance)) {
    console.error(`Missing ${obj.forward} ${aceType} in "instance.js" file for ${name}`)
    return false
  }
  return true
}

const validationPipeline = [validateDisplayText, ensureForwardScript];

async function valiatePlugin(pluginConfig) {
  //assume file is valid
  /** @type {Promise<() => boolean>[]} */
  const validations = [];

  // iterate over all the actions
  Object.keys(pluginConfig.Acts).forEach((key) => {
    const action = pluginConfig.Acts[key];
    validationPipeline.forEach((validationFunction) => {
      validations.push(() => validationFunction(key, action, 'action'));
    });
  });

  // iterate over all the conditions
  Object.keys(pluginConfig.Cnds).forEach((key) => {
    const condition = pluginConfig.Cnds[key];
    validationPipeline.forEach((validationFunction) => {
      validations.push(() => validationFunction(key, condition, 'condition'));
    });
  });

  // iterate over all the expressions
  Object.keys(pluginConfig.Exps).forEach((key) => {
    const expression = pluginConfig.Exps[key];
    validationPipeline.forEach((validationFunction) => {
      validations.push(() => validationFunction(key, expression, 'expression'));
    });
  });

  // check if any validation failed
  let isValid = [];
  for (const validation of validations) {
    const result = await validation()
    isValid.push(result);
  }
  return isValid.every((value) => value === true);
}

const validationResult = await valiatePlugin(config)

// check if the file is valid
if (validationResult) {
  console.info("Validation Passed");
  exit(0);
} else {
  console.error("Validation Failed");
  exit(1);
}
