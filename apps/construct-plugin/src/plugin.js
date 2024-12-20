const C3 = globalThis.C3;

//<-- PLUGIN_INFO -->

const camelCasedMap = new Map();

function camelCasify(str) {
  // If the string is already camelCased, return it
  if (camelCasedMap.has(str)) {
    return camelCasedMap.get(str);
  }
  // Replace any non-valid JavaScript identifier characters with spaces
  let cleanedStr = str.replace(/[^a-zA-Z0-9$_]/g, " ");

  // Split the string on spaces
  let words = cleanedStr.split(" ").filter(Boolean);

  // Capitalize the first letter of each word except for the first one
  for (let i = 1; i < words.length; i++) {
    words[i] = words[i].charAt(0).toUpperCase() + words[i].substring(1);
  }

  // Join the words back together
  let result = words.join("");

  // If the first character is a number, prepend an underscore
  if (!isNaN(parseInt(result.charAt(0)))) {
    result = "_" + result;
  }

  camelCasedMap.set(str, result);

  return result;
}

const parentClass = {
  object: {
    scripting: globalThis.IInstance,
    instance: globalThis.ISDKInstanceBase,
    plugin: globalThis.ISDKPluginBase,
  },
  world: {
    scripting: globalThis.IWorldInstance,
    instance: globalThis.ISDKWorldInstanceBase,
    plugin: globalThis.ISDKPluginBase,
  },
  dom: {
    scripting: globalThis.IDOMInstance,
    instance: globalThis.ISDKDOMInstanceBase,
    plugin: globalThis.ISDKDOMPluginBase,
  },
};

C3.Plugins[PLUGIN_INFO.id] = class extends (
  parentClass[PLUGIN_INFO.type].plugin
) {
  _release() {
    super._release();
  }
};
const P_C = C3.Plugins[PLUGIN_INFO.id];
P_C.Type = class extends globalThis.ISDKObjectTypeBase {
  constructor(objectClass) {
    super(objectClass);
  }

  _release() {
    super._release();
  }

  _onCreate() { }
};

const addonTriggers = [];

//============ ACES ============
P_C.Acts = {};
P_C.Cnds = {};
P_C.Exps = {};
Object.keys(PLUGIN_INFO.Acts).forEach((key) => {
  const ace = PLUGIN_INFO.Acts[key];
  P_C.Acts[camelCasify(key)] = function (...args) {
    return ace.forward
      ? ace.forward(this).call(this, ...args)
      : ace.handler.call(this, ...args);
  };
});
Object.keys(PLUGIN_INFO.Cnds).forEach((key) => {
  const ace = PLUGIN_INFO.Cnds[key];
  P_C.Cnds[camelCasify(key)] = function (...args) {
    return ace.forward
      ? ace.forward(this).call(this, ...args)
      : ace.handler.call(this, ...args);
  };
});
Object.keys(PLUGIN_INFO.Exps).forEach((key) => {
  const ace = PLUGIN_INFO.Exps[key];
  P_C.Exps[camelCasify(key)] = function (...args) {
    return ace.forward
      ? ace.forward(this).call(this, ...args)
      : ace.handler.call(this, ...args);
  };
});
//============ ACES ============

//<-- INSTANCE -->

P_C.Instance = class extends parentClass[PLUGIN_INFO.type].instance {
  constructor(opts) {
    if (PLUGIN_INFO.hasWrapperExtension) {
      opts.wrapperComponentId = PLUGIN_INFO.id;
      this._isWrapperExtensionAvailable = this.IsWrapperExtensionAvailable();
    }

    if (PLUGIN_INFO.hasDomSide) {
      super(opts, PLUGIN_INFO.id);
    } else {
      super(opts);
    }
  }

  _release() {
    super._release();
  }
};

P_C.Instance = getInstanceJs(P_C.Instance, addonTriggers, C3);
