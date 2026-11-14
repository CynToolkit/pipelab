import type { OpenDialogOptions } from "electron";
import type { ProviderReleaseDefinition } from "../release/types";
import type { WorkflowTask } from "@pipelab/workflow-runtime";

export type PathOptions = {
  filter?: RegExp;
  type?: "file" | "folder";
};

export interface ControlTypeBase {
  type: string;
}

export interface ControlTypeInput extends ControlTypeBase {
  type: "input";
  options: {
    kind: "number" | "text";
    validator?: string;
    placeholder?: string;
    password?: boolean;
  };
}

export interface PipelabSelectOption {
  label: string;
  value: string;
}

export interface ControlTypeSelect extends ControlTypeBase {
  type: "select";
  options: {
    options: Array<PipelabSelectOption>;
    placeholder: string;
  };
}

export interface ControlTypeMultiSelect extends ControlTypeBase {
  type: "multi-select";
  options: {
    options: Array<PipelabSelectOption>;
    placeholder: string;
  };
}

export interface ControlTypeBoolean extends ControlTypeBase {
  type: "boolean";
}

export interface ControlTypeCheckbox extends ControlTypeBase {
  type: "checkbox";
}

export interface ControlTypePath extends ControlTypeBase {
  type: "path";
  options: OpenDialogOptions;
  label?: string;
  warnIfBlacklisted?: boolean;
}

export interface ControlTypeJSON extends ControlTypeBase {
  type: "json";
}

export interface ControlTypeArray extends ControlTypeBase {
  type: "array";
  options: {
    kind: "number" | "text";
  };
}

export interface ControlTypeColor extends ControlTypeBase {
  type: "color";
}

export interface ControlTypeElectronConfigureV2 extends ControlTypeBase {
  type: "electron:configure:v2";
}

export type ControlType =
  | ControlTypeInput
  | ControlTypeSelect
  | ControlTypeMultiSelect
  | ControlTypeBoolean
  | ControlTypeCheckbox
  | ControlTypePath
  | ControlTypeJSON
  | ControlTypeArray
  | ControlTypeColor
  | ControlTypeElectronConfigureV2;

export type InputDefinition<T extends ControlType = ControlType> = {
  label: string;
  description?: string;
  validator?: () => any;
  required: boolean;
  control: T;
  value: unknown;
  platforms?: NodeJS.Platform[];
  onNodeUpdate?: (value: any, settings: InputDefinition<any>) => void;
};

export type InputsDefinition = Record<string, InputDefinition>;
export type IconType =
  | {
      type: "image";
      /**
       * base64 image
       */
      image: string;
    }
  | {
      type: "icon";
      icon: string;
    };
export interface IntegrationField {
  key: string;
  label: string;
  type: "text" | "password" | "file" | "directory";
  placeholder?: string;
}

export interface IntegrationDefinition {
  name: string;
  fields: IntegrationField[];
  /** True when the provider can check this connection's credentials (shows a Test button). */
  testable?: boolean;
}

/** Stable identity shared by a provider's main-process and renderer metadata. */
export interface ProviderIdentity {
  id: string;
  name: string;
  icon: IconType;
  description: string;
  isOfficial: boolean;
  packageName: string;
}

/** Renderer-safe provider metadata; native task factories stay in the main process. */
export interface RendererProviderMetadata extends ProviderIdentity {
  integrations?: Array<IntegrationDefinition>;
  release?: ProviderReleaseDefinition;
}

export type WorkflowTaskFactory<TServices> = (services: TServices) => WorkflowTask<TServices>;

export type WorkflowTaskFactoryRegistry<TServices> = Record<string, WorkflowTaskFactory<TServices>>;

/**
 * Outcome of a read-only check a destination runs before any step starts.
 * Only `failed` blocks a run; `unverifiable` (offline, no cheap check) passes.
 */
export type PreflightResult =
  | { status: "verified" }
  | { status: "unverifiable"; reason: string }
  | { status: "failed"; message: string };

export interface PreflightContext<TServices> {
  /** The destination step's resolved `with` inputs. */
  inputs: Record<string, unknown>;
  /** Connection fields resolved for this run, keyed by workflow alias. */
  connectionValues: Record<string, Record<string, string>>;
  services: TServices;
  signal?: AbortSignal;
}

/** Must not upload, write provider state, or prompt. Throwing counts as unverifiable. */
export type PreflightCheck<TServices> = (
  context: PreflightContext<TServices>,
) => Promise<PreflightResult>;

export type PreflightCheckRegistry<TServices> = Record<string, PreflightCheck<TServices>>;

export interface ConnectionTestContext<TServices> {
  /** The connection's own field values, keyed by integration field key. */
  values: Record<string, string>;
  services: TServices;
  signal?: AbortSignal;
}

/** Same contract as a preflight, but from a connection's values alone. Must not upload, write, or prompt. */
export type ConnectionTest<TServices> = (
  context: ConnectionTestContext<TServices>,
) => Promise<PreflightResult>;

/** Connection tests keyed by the connection's plugin name, e.g. "@pipelab/plugin-itch". */
export type ConnectionTestRegistry<TServices> = Record<string, ConnectionTest<TServices>>;

/** Complete built-in provider contribution consumed by Pipelab hosts. */
export interface ProviderDefinition<TServices = unknown> extends RendererProviderMetadata {
  workflowTasks?: WorkflowTaskFactoryRegistry<TServices>;
  /** Preflight checks keyed by the workflow task ID of the destination step they guard. */
  preflights?: PreflightCheckRegistry<TServices>;
  /** Read-only credential checks keyed by connection plugin name, run from the Connections page. */
  connectionTests?: ConnectionTestRegistry<TServices>;
}

/** Validates provider contributions while preserving the supplied definition's concrete type. */
export const createProviderDefinition = <
  TServices,
  TDefinition extends ProviderDefinition<TServices>,
>(
  definition: TDefinition & ProviderDefinition<TServices>,
): TDefinition => definition;

/** @deprecated Use ProviderIdentity for provider metadata. */
export interface PluginDefinition {
  packageName?: string;
}

/** @deprecated Compatibility alias for RendererProviderMetadata. */
export interface RendererPluginMetadata extends RendererProviderMetadata {}

/** @deprecated Use RendererProviderMetadata. */
export type RendererPluginDefinition = RendererPluginMetadata;

export interface MainPluginDefinition<TServices = unknown> extends ProviderDefinition<TServices> {
  validators?: Array<{
    id: string;
    description: string;
    validator: (options: any) => any;
  }>;
}

export type ParamsToInput<PARAMS extends InputsDefinition> = {
  [index in keyof PARAMS]: PARAMS[index]["required"] extends true
    ? PARAMS[index]["value"]
    : PARAMS[index]["value"] | null;
};

/** @deprecated Use createProviderDefinition for provider contributions. */
export const createDefinition = <T extends MainPluginDefinition>(definition: T) => {
  return definition satisfies T;
};

export const createStringParam = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeInput>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "input",
      options: {
        kind: "text",
      },
    },
    value: `"${value}"`,
  } satisfies InputDefinition<ControlTypeInput>;
};

export const createPasswordParam = (
  value: string,
  definition: Omit<InputDefinition<ControlTypeInput>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "input",
      options: {
        kind: "text",
        password: true,
      },
    },
    value: `"${value}"`,
  } satisfies InputDefinition<ControlTypeInput>;
};

export const createPathParam = (
  value: string | undefined,
  definition: Omit<InputDefinition<ControlTypePath>, "value">,
) => {
  return {
    ...definition,
    value: value ? `"${value}"` : value,
  } satisfies InputDefinition<ControlTypePath>;
};

export const createNumberParam = (
  value: number,
  definition: Omit<InputDefinition<ControlTypeInput>, "value" | "control">,
) => {
  return {
    ...definition,
    control: {
      type: "input",
      options: {
        kind: "number",
      },
    },
    value,
  } satisfies InputDefinition<ControlTypeInput>;
};
