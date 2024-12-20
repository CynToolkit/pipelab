const SDK = self.SDK;

//<-- PLUGIN_INFO -->

let app = null;

SDK.Plugins[PLUGIN_INFO.id] = class extends SDK.IPluginBase {
  constructor() {
    super(PLUGIN_INFO.id);
    SDK.Lang.PushContext("plugins." + PLUGIN_INFO.id.toLowerCase());
    this._info.SetName(self.lang(".name"));
    this._info.SetDescription(self.lang(".description"));
    this._info.SetVersion(PLUGIN_INFO.version);
    this._info.SetCategory(PLUGIN_INFO.category);
    this._info.SetAuthor(PLUGIN_INFO.author);
    this._info.SetPluginType(
      PLUGIN_INFO.type === "object" ? "object" : "world"
    );
    this._info.SetHelpUrl(self.lang(".help-url"));
    if (PLUGIN_INFO.icon) {
      this._info.SetIcon(
        PLUGIN_INFO.icon,
        PLUGIN_INFO.icon.endsWith(".svg") ? "image/svg+xml" : "image/png"
      );
    }

    if (PLUGIN_INFO.info.defaultImageUrl) {
      this._info.SetDefaultImageURL(
        `c3runtime/${PLUGIN_INFO.info.defaultImageUrl}`
      );
    }

    if (PLUGIN_INFO.domSideScripts) {
      this._info.SetDOMSideScripts(
        PLUGIN_INFO.domSideScripts.map((s) => `c3runtime/${s}`)
      );
    }

    if (PLUGIN_INFO.extensionScript && PLUGIN_INFO.extensionScript.enabled) {
      const targets = PLUGIN_INFO.extensionScript.targets || [];
      targets.forEach((target) => {
        this._info.AddFileDependency({
          filename: `${PLUGIN_INFO.id}_${target.toLowerCase()}.ext.dll`,
          type: "wrapper-extension",
          platform: `windows-${target.toLowerCase()}`,
        });
      });
    }
    if (PLUGIN_INFO.fileDependencies) {
      PLUGIN_INFO.fileDependencies.forEach((file) => {
        this._info.AddFileDependency({
          ...file,
          filename: `c3runtime/${file.filename}`,
        });
      });
    }

    if (PLUGIN_INFO.info && PLUGIN_INFO.info.Set)
      Object.keys(PLUGIN_INFO.info.Set).forEach((key) => {
        const value = PLUGIN_INFO.info.Set[key];
        const fn = this._info[`Set${key}`];
        if (fn && value !== null && value !== undefined)
          fn.call(this._info, value);
      });
    if (PLUGIN_INFO.info && PLUGIN_INFO.info.AddCommonACEs)
      Object.keys(PLUGIN_INFO.info.AddCommonACEs).forEach((key) => {
        if (PLUGIN_INFO.info.AddCommonACEs[key])
          this._info[`AddCommon${key}ACEs`]();
      });
    SDK.Lang.PushContext(".properties");
    this._info.SetProperties(
      (PLUGIN_INFO.properties || []).map(
        (prop) => new SDK.PluginProperty(prop.type, prop.id, prop.options)
      )
    );
    SDK.Lang.PopContext(); // .properties
    SDK.Lang.PopContext();
  }
};
const P_C = SDK.Plugins[PLUGIN_INFO.id];
P_C.Register(PLUGIN_INFO.id, P_C);

P_C.Type = class extends SDK.ITypeBase {
  constructor(sdkPlugin, iObjectType) {
    super(sdkPlugin, iObjectType);
  }
};

const instanceParentClasses = {
  object: SDK.IInstanceBase,
  world: SDK.IWorldInstanceBase,
  dom: SDK.IWorldInstanceBase,
};
P_C.Instance = class extends instanceParentClasses[PLUGIN_INFO.type] {
  constructor(sdkType, inst) {
    super(sdkType, inst);
  }

  Release() {}

  OnCreate() {}

  OnPlacedInLayout() {}

  OnPropertyChanged(id, value) {}

  LoadC2Property(name, valueString) {
    return false; // not handled
  }
};
