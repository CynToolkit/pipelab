<template>
  <div class="editor">
    <div v-if="paramDefinition.control.type === 'input'" class="input">
      <template v-if="paramDefinition.control.options.kind === 'text'">
        <Password
          v-if="paramDefinition.control.options.password"
          :model-value="modelValueString"
          :placeholder="paramDefinition.control.options.placeholder"
          :toggle-mask="true"
          :feedback="false"
          :class="{
            'w-full': true,
          }"
          input-class="w-full"
          @update:model-value="onParamInputTextChange"
        >
        </Password>
        <InputText
          v-else
          :model-value="modelValueString"
          :placeholder="paramDefinition.control.options.placeholder"
          class="w-full"
          @update:model-value="onParamInputTextChange"
        />
      </template>
      <InputNumber
        v-else-if="paramDefinition.control.options.kind === 'number'"
        :model-value="modelValueNumber"
        show-buttons
        option-label="label"
        class="w-full"
        :format="false"
        @input="onParamInputNumberChange"
      />
    </div>
    <div v-else-if="paramDefinition.control.type === 'boolean'" class="boolean">
      <SelectButton
        :model-value="modelValue"
        option-label="text"
        option-value="value"
        :options="booleanOptions"
        aria-labelledby="basic"
        @change="onSelectChange"
      >
        <template #option="slotProps">
          <span>{{ slotProps.option.text }}</span>
        </template>
      </SelectButton>
    </div>
    <div v-else-if="paramDefinition.control.type === 'path'" class="path">
      <Button
        class="w-full"
        outlined
        :severity="isBlacklisted ? 'danger' : 'secondary'"
        @click="onChangePathClick(paramDefinition.control.options)"
      >
        {{ modelValue ? modelValue : (paramDefinition.control.label ?? "Browse path") }}
      </Button>
      <div v-if="isBlacklisted" class="warning-banner">
        <i class="pi pi-exclamation-triangle"></i>
        <span
          >Protected system/user folder. Running cleanup/destructive actions on this path is
          blocked.</span
        >
      </div>
    </div>
    <div
      v-else-if="paramDefinition.control.type === 'electron:configure:v2'"
      class="electron:configure:v2"
    >
      <div class="body">
        <div class="label">Electron version</div>
        <InputText />
        <div class="label">Custom main code</div>
        <InputText />
        <div class="label">Enable steam support</div>
        <Checkbox />
      </div>
    </div>
    <div v-else-if="paramDefinition.control.type === 'select'" class="select">
      <Listbox
        :model-value="modelValue"
        :options="paramDefinition.control.options.options"
        filter
        option-value="value"
        option-label="label"
        class="w-full"
        @change="onParamSelectChange"
      />
    </div>
    <div v-else-if="paramDefinition.control.type === 'multi-select'" class="multi-select">
      <Listbox
        :model-value="modelValue"
        :options="paramDefinition.control.options.options"
        filter
        multiple
        option-label="label"
        class="w-full"
        @change="onParamMultiSelectChange"
      />
    </div>
    <div v-else-if="paramDefinition.control.type === 'netlify-site'" class="netlify-site">
      <pre>{{ currentNodeParams[paramDefinition.control.options.tokenKey] }}</pre>
      <!-- An input with a button to ask to create a new website -->
      <Select
        :placeholder="paramDefinition.control.options.placeholder"
        :model-value="modelValue"
        :options="items"
        option-label="name"
        option-value="id"
        :loading="netlifySelectLoading"
        :disabled="
          netlifySelectLoading || !currentNodeParams[paramDefinition.control.options.tokenKey]
        "
        class="w-full"
        @update:model-value="onParamNetlifySiteChange"
      >
        <!-- <template #option="slotProps">
          <div>{{ slotProps.option.name }}</div>
        </template>
        <template #chip="slotProps">
          <div>{{ slotProps.value.name }}</div>
        </template> -->
      </Select>
      <Message v-if="!currentNodeParams[paramDefinition.control.options.tokenKey]" severity="error"
        >No token found</Message
      >
      <!-- <Button class="w-full" @click="onChangeNetlifySiteClick(paramDefinition.control.options)">
        {{ modelValue ? modelValue : (paramDefinition.control.label ?? 'Browse path') }}
      </Button> -->
    </div>
    <div v-else-if="paramDefinition.control.type === 'color'" class="color">
      <ColorPicker :model-value="modelValueColor" @update:model-value="onParamColorChange" />
    </div>
    <Button v-else class="w-full" severity="secondary" outlined @click="onSwitch">Switch to editor to edit value</Button>
  </div>
</template>

<script lang="ts" setup>
import { Action, Event } from "@pipelab/shared";
import type { ValueOf } from "type-fest";
import { computed, PropType, toRefs, ref, onMounted, watch } from "vue";
import { useAPI } from "@renderer/composables/api";
import { useShell } from "@renderer/composables/use-shell";
import { useLogger } from "@pipelab/shared";
import slash from "slash";
import type { OpenDialogOptions } from "electron";
import { SelectButtonChangeEvent } from "primevue/selectbutton";
import { ListboxChangeEvent } from "primevue/listbox";
import { InputNumberInputEvent } from "primevue/inputnumber";
import { BlockAction, BlockEvent } from "@pipelab/shared";
import { useEditor } from "@renderer/store/editor";
import { storeToRefs } from "pinia";
import ColorPicker from "../ColorPicker.vue";

type Params = (Action | Event)["params"];

const props = defineProps<{
  paramDefinition: ValueOf<Params>;
  modelValue?: unknown;
  value: BlockAction | BlockEvent;
  paramKey?: string | number;
}>();

const { modelValue } = toRefs(props);

const emit = defineEmits<{
  (event: "update:modelValue", data: any): void;
  (event: "switch"): void;
}>();

const api = useAPI();

const { logger } = useLogger();
const editor = useEditor();
const shell = useShell();
const { resolvedParams } = storeToRefs(editor);

const currentNodeParams = computed(() => {
  return resolvedParams.value[props.value.uid];
});

/** Netlify */
const netlifySelectLoading = ref(false);
const search = async (event: { query: string }) => {
  netlifySelectLoading.value = true;
  try {
    const control = props.paramDefinition.control;
    if (control.type === "netlify-site") {
      const response = await fetch(`https://api.netlify.com/api/v1/sites`, {
        headers: {
          Authorization: `Bearer ${currentNodeParams.value[control.options.tokenKey]}`,
        },
      });
      const data = await response.json();

      console.log("data", data);

      items.value = data;
    }
  } catch (error) {
    console.error(error);
  } finally {
    netlifySelectLoading.value = false;
  }
};
const items = ref();

const onChangePathClick = async (options: OpenDialogOptions = {}) => {
  const isDirectory = options?.properties?.includes("openDirectory");

  const pathsResponse = await (isDirectory
    ? shell.openDirectory(options)
    : shell.openFile(options));

  if (pathsResponse.type === "error") {
    throw new Error(pathsResponse.ipcError);
  }

  const paths = pathsResponse.result;

  logger().info("paths", paths);

  if (paths.canceled || !paths.filePaths || paths.filePaths.length === 0) {
    return;
  }

  const p = paths.filePaths[0];
  const normalized = slash(p);
  emit("update:modelValue", `"${normalized}"`);
};
const onParamNetlifySiteChange = (event: string) => {
  console.log("event", event);
  emit("update:modelValue", `"${event}"`);
};

const onParamSelectChange = (event: ListboxChangeEvent) => {
  console.log("event", event);
  emit("update:modelValue", `"${event.value}"`);
};

const onParamInputTextChange = (event: string | undefined) => {
  emit("update:modelValue", `"${event ?? ""}"`);
};

// const onParamInputNumberChange = (event: number) => {
//   console.log('event', event)
//   emit('update:modelValue', event)
// }
const onParamInputNumberChange = (event: InputNumberInputEvent) => {
  console.log("event", event);
  emit("update:modelValue", event.value);
};

const onParamMultiSelectChange = (
  event: Omit<ListboxChangeEvent, "value"> & {
    value: { label: string; value: string }[];
  },
) => {
  const data = event.value.map((v) => v.value);

  emit("update:modelValue", `${JSON.stringify(data)}`);
};

const onSelectChange = (event: SelectButtonChangeEvent) => {
  emit("update:modelValue", event.value);
};

const onParamColorChange = (value: string) => {
  emit("update:modelValue", `"${value}"`);
};

const booleanOptions = [
  { text: "True", value: true },
  { text: "False", value: false },
];

const modelValueString = computed(() => {
  if (modelValue.value === undefined || modelValue.value === null) {
    return "";
  }
  return modelValue.value.toString();
});

const modelValueNumber = computed<number | undefined>(() => {
  return Number.parseInt(modelValueString.value);
});

const modelValueColor = computed(() => {
  const str = modelValueString.value;
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str;
});

const onSwitch = () => {
  emit("switch");
};

const cleanPath = computed(() => {
  let val = modelValueString.value.trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1);
  }
  return val;
});

const isBlacklisted = computed(() => {
  if (!props.paramKey) return false;
  const nodeErrors = editor.errors[props.value.uid] ?? [];
  return nodeErrors.some((e) => e.type === "blacklisted" && e.param === String(props.paramKey));
});

onMounted(() => {
  if (props.paramDefinition.control.type === "netlify-site") {
    search({ query: "" });
  }
});
</script>

<style lang="scss" scoped>
.warning-banner {
  margin-top: 0.5rem;
  padding: 0.5rem;
  font-size: 0.875rem;
  background-color: rgba(120, 50, 10, 0.2);
  color: #ff9800;
  border: 1px solid rgba(255, 152, 0, 0.3);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  i {
    font-size: 1rem;
  }
}
</style>
