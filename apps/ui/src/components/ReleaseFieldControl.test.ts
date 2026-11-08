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
  app.directive("tooltip", {});
  app.mount(root);
  mountedApps.push(app);
  return { root, updates, bindingUpdates };
};

const environmentToggle = (root: HTMLElement) =>
  root.querySelector(".environment-toggle") as HTMLButtonElement;
const clickEnvironmentToggle = async (root: HTMLElement) => {
  environmentToggle(root).click();
  await nextTick();
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

  it("suggests a stable environment name from the inline toggle and restores it after reload", async () => {
    const { root, updates } = mountField("release title");

    expect(root.querySelector("details")).toBeNull();
    expect(environmentToggle(root)).not.toBeNull();
    expect(environmentToggle(root).getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector("#field-title-environment-variable")).toBeNull();

    await clickEnvironmentToggle(root);

    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(variableName.value).toBe("PIPELAB_TITLE");
    expect(updates.at(-1)).toBe("${{ env.PIPELAB_TITLE }}");

    const reopened = mountField(String(updates.at(-1)));
    const reopenedName = reopened.root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(reopenedName.value).toBe("PIPELAB_TITLE");
  });

  it("persists an environment binding and restores the literal when disabled", async () => {
    const { root, updates } = mountField("local title");

    expect(environmentToggle(root).getAttribute("aria-pressed")).toBe("false");
    await clickEnvironmentToggle(root);
    expect(environmentToggle(root).getAttribute("aria-pressed")).toBe("true");
    expect(updates.at(-1)).toBe("${{ env.PIPELAB_TITLE }}");
    expect(invalidEnvironmentBindingPaths(flowWithSourcePath(String(updates.at(-1))))).toEqual([]);
    expect(root.querySelector('[role="alert"]')).toBeNull();

    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;
    expect(variableName.value).toBe("PIPELAB_TITLE");
    await dispatchInput(variableName, "BUILD_LABEL");
    expect(updates.at(-1)).toBe("${{ env.BUILD_LABEL }}");

    await clickEnvironmentToggle(root);
    expect(updates.at(-1)).toBe("local title");
    expect(root.querySelector("#field-title")).toHaveProperty("value", "local title");
  });

  it("loads a saved binding and rejects invalid environment variable names", async () => {
    const { root, updates } = mountField("${{ env.BUILD_LABEL }}");
    const variableName = root.querySelector(
      "#field-title-environment-variable",
    ) as HTMLInputElement;

    expect(environmentToggle(root).getAttribute("aria-pressed")).toBe("true");
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
    await clickEnvironmentToggle(root);

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
    expect(environmentToggle(reopened.root).getAttribute("aria-pressed")).toBe("true");
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

  it("offers the same trailing toggle on select, path and password fields", () => {
    for (const definition of [
      { key: "channel", type: "select", label: "Channel" },
      { key: "path", type: "directory", label: "Folder" },
      { key: "secret", type: "password", label: "Secret" },
    ] as ReleaseFieldDefinition[]) {
      const { root } = mountField("", definition, [], "", undefined, true);
      const row = root.querySelector(".field-control-row");
      expect(row?.lastElementChild).toBe(environmentToggle(root));
      expect(row?.firstElementChild).not.toBe(environmentToggle(root));
    }
  });

  it("omits the toggle when advanced controls are hidden", () => {
    const root = document.createElement("div");
    const app = createApp({
      render: () =>
        h(ReleaseFieldControl, {
          field,
          value: "",
          options: [],
          inputId: "field-title",
          hideAdvanced: true,
        }),
    });
    app.use(PrimeVue);
    app.directive("tooltip", {});
    app.mount(root);
    mountedApps.push(app);

    expect(root.querySelector(".environment-toggle")).toBeNull();
    expect(root.querySelector("#field-title")).not.toBeNull();
  });

  it("renders **bold** and `code` in a description as elements, never as HTML", () => {
    const { root } = mountField("", {
      key: "version",
      type: "text",
      label: "Version",
      description: "**Leave empty** for the saved one. Appended to `editor/` <img src=x>.",
    });
    const help = root.querySelector(".field-help") as HTMLElement;

    expect(help.querySelector("strong")?.textContent).toBe("Leave empty");
    expect(help.querySelector("code")?.textContent).toBe("editor/");
    expect(help.querySelector("img")).toBeNull();
    expect(help.textContent).toContain("<img src=x>");
  });

  it("uses the field placeholder in the empty input", () => {
    const { root } = mountField("", {
      key: "version",
      type: "text",
      label: "Version",
      placeholder: "Empty: the saved release",
    });

    expect((root.querySelector("#field-title") as HTMLInputElement).placeholder).toBe(
      "Empty: the saved release",
    );
  });

  it("offers one-click suggestions on a text field without restricting the value", async () => {
    const { root, updates } = mountField(
      "r400",
      { key: "version", type: "text", label: "Version" },
      [
        { label: "r466-2 · saved in project", value: "r466-2" },
        { label: "latest", value: "latest" },
      ],
    );
    const chips = [...root.querySelectorAll<HTMLButtonElement>(".suggestion-chip")];

    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      "r466-2 · saved in project",
      "latest",
    ]);
    // A custom value stays editable and no suggestion claims to be selected.
    expect(chips.every((chip) => chip.getAttribute("aria-pressed") === "false")).toBe(true);

    chips[1]!.click();
    await nextTick();
    expect(updates.at(-1)).toBe("latest");
  });

  it("clears a suggestion that is clicked again so the field falls back to empty", async () => {
    const { root, updates } = mountField("latest", { key: "version", type: "text", label: "V" }, [
      { label: "latest", value: "latest" },
    ]);
    const chip = root.querySelector(".suggestion-chip") as HTMLButtonElement;

    expect(chip.getAttribute("aria-pressed")).toBe("true");
    chip.click();
    await nextTick();
    expect(updates.at(-1)).toBe("");
  });

  it("does not show suggestions for select fields or while an environment variable is bound", () => {
    const options = [{ label: "latest", value: "latest" }];
    const select = mountField("", { key: "channel", type: "select", label: "Channel" }, options);
    const bound = mountField(
      "${{ env.CONSTRUCT_VERSION }}",
      { key: "version", type: "text", label: "Version" },
      options,
    );

    expect(select.root.querySelector(".suggestion-chip")).toBeNull();
    expect(bound.root.querySelector(".suggestion-chip")).toBeNull();
  });

  it("keeps connection fields outside ordinary environment bindings", () => {
    const connectionField: ReleaseFieldDefinition = {
      key: "account",
      type: "connection",
      label: "Account",
      integration: "example",
    };
    const { root } = mountField("${{ env.ACCOUNT }}", connectionField);

    expect(root.querySelector(".environment-toggle")).toBeNull();
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

    expect(root.querySelector("details")).toBeNull();
    expect(root.querySelector("#field-title-alias")).toBeNull();
    expect(root.querySelector(".alias-caption")?.textContent).toContain("publish");
    (root.querySelector(".alias-edit") as HTMLButtonElement).click();
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

  it("lets an account be picked without a workflow alias, leaving naming to the parent", () => {
    const { root } = mountField(
      "",
      { key: "account", type: "connection", label: "Account", integration: "store" },
      [{ label: "Production", value: "connection-prod" }],
    );

    expect(root.querySelector("#field-title")).toHaveProperty("disabled", false);
    expect(root.querySelector(".alias-caption")).toBeNull();
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
    expect(root.querySelector("#field-title")).toHaveProperty("disabled", false);
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
