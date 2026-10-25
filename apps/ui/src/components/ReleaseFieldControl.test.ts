// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import PrimeVue from "primevue/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReleaseConfig, ReleaseFieldDefinition } from "@pipelab/shared";
import ReleaseFieldControl from "./ReleaseFieldControl.vue";
import { invalidEnvironmentBindingPaths } from "../pages/release-flow-model";

vi.mock("primevue/select", () => ({
  default: defineComponent({
    name: "SelectStub",
    props: { modelValue: String, options: Array, optionLabel: String, optionValue: String },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
      return () =>
        h(
          "select",
          {
            ...attrs,
            class: "connection-select",
            value: props.modelValue,
            onChange: (event: Event) =>
              emit("update:modelValue", (event.target as HTMLSelectElement).value),
          },
          (props.options as Array<Record<string, string>>).map((option) =>
            h(
              "option",
              { value: option[props.optionValue || "value"] },
              option[props.optionLabel || "label"],
            ),
          ),
        );
    },
  }),
}));

vi.mock("primevue/button", () => ({
  default: defineComponent({
    props: { label: String },
    setup(props, { attrs }) {
      return () => h("button", attrs, props.label);
    },
  }),
}));

const field: ReleaseFieldDefinition = { key: "title", type: "text", label: "Title" };
const mountedApps: App[] = [];
const flowWithSourcePath = (path: string) =>
  ({
    source: { provider: "source/local", config: { path } },
    builds: [],
    destinations: [],
  }) as unknown as ReleaseConfig;

const mountField = (
  value: string,
  fieldDefinition: ReleaseFieldDefinition = field,
  options: Array<{ label: string; value: string }> = [],
  connectionBinding = "",
  connectionBindingSuggestion?: { label: string; value: string },
  allowPathEdit = false,
) => {
  const root = document.createElement("div");
  const updates: unknown[] = [];
  const bindingUpdates: unknown[] = [];
  const app = createApp({
    render: () =>
      h(ReleaseFieldControl, {
        field: fieldDefinition,
        value,
        options,
        inputId: "field-title",
        connectionBinding,
        connectionBindingSuggestion,
        allowPathEdit,
        "onUpdate:value": (nextValue: unknown) => updates.push(nextValue),
        "onUpdate:connection-binding": (nextValue: unknown) => bindingUpdates.push(nextValue),
      }),
  });
  app.use(PrimeVue);
  app.mount(root);
  mountedApps.push(app);
  return { root, updates, bindingUpdates };
};

const dispatchInput = async (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
};

afterEach(() => {
  while (mountedApps.length) mountedApps.pop()?.unmount();
});

describe("ReleaseFieldControl", () => {
  it("keeps the literal text input visible when environment binding is disabled", () => {
    const { root } = mountField("release title");
    const input = root.querySelector("#field-title") as HTMLInputElement | null;

    expect(input).not.toBeNull();
    expect(input?.value).toBe("release title");
  });

  it("keeps the literal select visible when environment binding is disabled", () => {
    const { root } = mountField("stable", { key: "channel", type: "select", label: "Channel" }, [
      { label: "Stable", value: "stable" },
    ]);
    const select = root.querySelector("#field-title") as HTMLSelectElement | null;

    expect(select).not.toBeNull();
    expect(select?.value).toBe("stable");
  });

  it("shows the environment name instead of an editable serialized text value", () => {
    const { root } = mountField("${{ env.PROJECT_ID }}");

    expect(root.querySelector("#field-title-environment-variable")).toHaveProperty(
      "value",
      "PROJECT_ID",
    );
    expect(root.querySelector("#field-title")).toBeNull();
  });

  it("hides ordinary select and path controls while their values are environment-bound", () => {
    const channel = mountField(
      "${{ env.RELEASE_CHANNEL }}",
      { key: "channel", type: "select", label: "Channel" },
      [{ label: "Stable", value: "stable" }],
    );
    const sourcePath = mountField(
      "${{ env.SOURCE_DIRECTORY }}",
      { key: "path", type: "directory", label: "Folder" },
      [],
      "",
      undefined,
      true,
    );

    expect(channel.root.querySelector("#field-title-environment-variable")).toHaveProperty(
      "value",
      "RELEASE_CHANNEL",
    );
    expect(channel.root.querySelector("#field-title")).toBeNull();
    expect(sourcePath.root.querySelector("#field-title-environment-variable")).toHaveProperty(
      "value",
      "SOURCE_DIRECTORY",
    );
    expect(sourcePath.root.querySelector("#field-title")).toBeNull();
  });

  it("keeps an editable literal path input visible while environment binding is disabled", () => {
    const { root } = mountField(
      "/workspace/game",
      { key: "projectPath", type: "directory", label: "Project folder" },
      [],
      "",
      undefined,
      true,
    );
    const input = root.querySelector("#field-title") as HTMLInputElement | null;

    expect(input).not.toBeNull();
    expect(input?.value).toBe("/workspace/game");
  });

  it("suggests a stable environment name in Advanced mode and restores it after reload", async () => {
    const { root, updates } = mountField("release title");
    const advanced = root.querySelector("details.environment-advanced") as HTMLDetailsElement;

    expect(advanced).not.toBeNull();
    expect(advanced.open).toBe(false);
    advanced.open = true;
    await nextTick();

    const toggle = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();

    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(variableName.value).toBe("PIPELAB_TITLE");
    expect(updates.at(-1)).toBe("${{ env.PIPELAB_TITLE }}");

    const reopened = mountField(String(updates.at(-1)));
    const reopenedAdvanced = reopened.root.querySelector(
      "details.environment-advanced",
    ) as HTMLDetailsElement;
    const reopenedName = reopened.root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(reopenedAdvanced.open).toBe(true);
    expect(reopenedName.value).toBe("PIPELAB_TITLE");
  });

  it("persists an environment binding and restores the literal when disabled", async () => {
    const { root, updates } = mountField("local title");
    const toggle = root.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(toggle.checked).toBe(true);
    expect(updates.at(-1)).toBe("${{ env.PIPELAB_TITLE }}");
    expect(invalidEnvironmentBindingPaths(flowWithSourcePath(String(updates.at(-1))))).toEqual([]);
    expect(root.querySelector('[role="alert"]')).toBeNull();

    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(variableName.value).toBe("PIPELAB_TITLE");
    await dispatchInput(variableName, "BUILD_LABEL");
    expect(updates.at(-1)).toBe("${{ env.BUILD_LABEL }}");

    toggle.checked = false;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(updates.at(-1)).toBe("local title");
    expect(root.querySelector("#field-title")).toHaveProperty("value", "local title");
  });

  it("loads a saved binding and rejects invalid environment variable names", async () => {
    const { root, updates } = mountField("${{ env.BUILD_LABEL }}");
    const toggle = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;

    expect(toggle.checked).toBe(true);
    expect(variableName.value).toBe("BUILD_LABEL");

    await dispatchInput(variableName, "BUILD-LABEL");
    expect(invalidEnvironmentBindingPaths(flowWithSourcePath(String(updates.at(-1))))).toEqual([
      "source.config.path",
    ]);
    expect(variableName.getAttribute("aria-invalid")).toBe("true");
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "Use letters, numbers, and underscores only",
    );

    await dispatchInput(variableName, "RELEASE_LABEL");
    expect(updates.at(-1)).toBe("${{ env.RELEASE_LABEL }}");
  });

  it("keeps a brace-containing invalid name blocked and editable after remount", async () => {
    const { root, updates } = mountField("local title");
    const toggle = root.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();

    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    await dispatchInput(variableName, "BAD}}NAME");
    const invalidDraft = String(updates.at(-1));
    expect(invalidEnvironmentBindingPaths(flowWithSourcePath(invalidDraft))).toEqual([
      "source.config.path",
    ]);

    const reopened = mountField(invalidDraft);
    const reopenedName = reopened.root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(reopened.root.querySelector('input[type="checkbox"]')).toHaveProperty("checked", true);
    expect(reopenedName.value).toBe("BAD}}NAME");
    expect(reopenedName.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows a marker-shaped saved literal as invalid instead of decoding it", () => {
    const reopened = mountField("${{ env.__pipelab_invalid_binding__:0041 }}");
    const variableName = reopened.root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;

    expect(variableName.value).toBe("__pipelab_invalid_binding__:0041");
    expect(variableName.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows an error for an invalid saved environment binding", () => {
    const { root } = mountField("${{ env.BUILD-LABEL }}");
    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;

    expect(variableName.getAttribute("aria-invalid")).toBe("true");
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "Use letters, numbers, and underscores only",
    );
  });

  it("keeps connection fields outside ordinary environment bindings", () => {
    const connectionField: ReleaseFieldDefinition = {
      key: "account",
      type: "connection",
      label: "Account",
      integration: "example",
    };
    const { root } = mountField("${{ env.ACCOUNT }}", connectionField);

    expect(root.querySelector('input[type="checkbox"]')).toBeNull();
    expect(root.querySelector("#field-title-environment-variable")).toBeNull();
    expect(root.querySelector(".connection-field")).not.toBeNull();
  });

  it("edits a workflow alias separately from its local Connection binding", async () => {
    const { root, updates, bindingUpdates } = mountField(
      "publish",
      { key: "account", type: "connection", label: "Store account", integration: "store" },
      [{ label: "Production", value: "connection-prod" }],
      "connection-prod",
    );
    const connection = root.querySelector("#field-title") as HTMLSelectElement;

    const advanced = root.querySelector("details.connection-advanced") as HTMLDetailsElement;
    expect(advanced).not.toBeNull();
    expect(advanced.open).toBe(false);
    expect(advanced.textContent).toContain("Advanced");
    advanced.open = true;
    await nextTick();
    const alias = root.querySelector("#field-title-alias") as HTMLInputElement;

    expect(alias.value).toBe("publish");
    expect(connection.value).toBe("connection-prod");
    expect(root.querySelector(".connection-alias .field-help")?.textContent).toContain(
      "update any CLI or CI --connection overrides",
    );

    await dispatchInput(alias, "release");
    alias.dispatchEvent(new Event("blur"));
    await nextTick();
    expect(updates.at(-1)).toBe("release");

    connection.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(bindingUpdates.at(-1)).toBe("connection-prod");
  });

  it("requires a workflow alias before remembering a local Connection", () => {
    const { root } = mountField(
      "",
      { key: "account", type: "connection", label: "Account", integration: "store" },
      [{ label: "Production", value: "connection-prod" }],
    );

    expect(root.querySelector("#field-title")).toHaveProperty("disabled", true);
  });

  it("allows an empty optional Connection alias for profile-only provider sessions", () => {
    const { root } = mountField("", {
      key: "account",
      type: "connection",
      label: "Construct account",
      integration: "Construct Account",
      required: false,
    });

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector("#field-title")).toHaveProperty("disabled", true);
  });

  it("requires explicit confirmation before applying a unique compatible Connection suggestion", async () => {
    const { root, bindingUpdates } = mountField(
      "steam-publish",
      { key: "account", type: "connection", label: "Steam account", integration: "steam" },
      [{ label: "Production · Steam Account", value: "steam-prod" }],
      "",
      { label: "Production · Steam Account", value: "steam-prod" },
    );

    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      "Production · Steam Account",
    );
    expect(bindingUpdates).toEqual([]);

    const confirm = [...root.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Use this Connection"),
    );
    expect(confirm).toBeDefined();
    confirm?.click();
    await nextTick();
    expect(bindingUpdates).toEqual(["steam-prod"]);
  });
});
