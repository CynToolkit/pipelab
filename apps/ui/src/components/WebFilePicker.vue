<template>
  <Dialog
    v-model:visible="uiStore.isFilePickerVisible"
    modal
    :header="dialogTitle"
    :style="{ width: '70vw', height: '80vh' }"
    :closable="true"
    @hide="onCancel"
  >
    <div class="web-file-picker">
      <Message v-if="errorMessage" severity="error">{{ errorMessage }}</Message>
      <Message v-if="options?.message" severity="info">{{ options.message }}</Message>
      <div class="toolbar mb-3 flex gap-2 align-items-center">
        <Button icon="pi pi-home" text @click="goToHome" />
        <Button icon="pi pi-arrow-up" text @click="goUp" :disabled="isAtRoot" />
        <InputText v-model="currentPath" class="flex-grow-1" @keydown.enter="loadDirectory" />
        <Button v-if="canCreateDirectory" icon="pi pi-folder-plus" text @click="createDirectory" />
        <Button icon="pi pi-refresh" text @click="loadDirectory" />
      </div>
      <div class="picker-body flex flex-grow-1 min-h-0 gap-3">
        <nav class="roots-sidebar flex-shrink-0 border-1 border-300 border-round p-2">
          <div class="text-xs text-600 font-semibold px-2 mb-2">Locations</div>
          <Button
            v-for="root in roots"
            :key="root.path"
            :label="root.name"
            :icon="root.name === 'Home' ? 'pi pi-home' : 'pi pi-database'"
            text
            class="root-button w-full justify-content-start"
            :class="{ 'root-button-active': samePath(root.path, currentPath) }"
            @click="navigateToRoot(root.path)"
          />
        </nav>
        <div class="file-list-container flex-grow-1 overflow-auto border-1 border-300 border-round">
          <DataTable
            :value="visibleFiles"
            v-model:selection="selection"
            :selectionMode="allowMultiple ? 'multiple' : 'single'"
            dataKey="name"
            class="p-datatable-sm"
            @row-dblclick="onRowDblClick"
            :loading="isLoading"
          >
            <Column v-if="allowMultiple" selectionMode="multiple" headerStyle="width: 3rem" />
            <Column field="name" header="Name" sortable
              ><template #body="{ data }"
                ><div class="flex align-items-center gap-2">
                  <i :class="getFileIcon(data)" /><span>{{ data.name }}</span>
                </div></template
              ></Column
            >
            <Column field="size" header="Size" sortable
              ><template #body="{ data }">{{
                data.isDirectory ? "--" : formatSize(data.size)
              }}</template></Column
            >
            <Column field="mtime" header="Modified" sortable
              ><template #body="{ data }">{{ formatDate(data.mtime) }}</template></Column
            >
          </DataTable>
        </div>
      </div>
      <div class="footer mt-3 flex justify-content-between align-items-center">
        <div class="selected-name flex-grow-1 mr-3">
          <label v-if="isSave" class="block text-sm mb-1">{{
            options?.nameFieldLabel || "File name"
          }}</label
          ><InputText
            v-if="isSave"
            v-model="saveFileName"
            class="w-full"
            @keydown.enter="onConfirm"
          />
          <div v-else class="text-sm text-600 truncate">
            {{
              selectedFiles.length
                ? selectedFiles.map((f) => f.name).join(", ")
                : "No file selected"
            }}
          </div>
        </div>
        <div class="actions flex gap-2">
          <Button label="Cancel" text severity="secondary" @click="onCancel" /><Button
            :label="options?.buttonLabel || (isSave ? 'Save' : 'Open')"
            @click="onConfirm"
            :disabled="!canConfirm"
          />
        </div>
      </div>
    </div>
  </Dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useUIStore, type FilePickerOptions } from "../store/ui";
import { useAPI } from "../composables/api";
import { useLogger } from "@pipelab/shared";
interface FileItem {
  name: string;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  mtime: number;
}
const uiStore = useUIStore();
const api = useAPI();
const { logger } = useLogger();
const options = computed(() => uiStore.filePickerOptions);
const currentPath = ref("");
const files = ref<FileItem[]>([]);
const roots = ref<{ name: string; path: string }[]>([]);
const selection = ref<FileItem | FileItem[] | null>(null);
const saveFileName = ref("");
const isLoading = ref(false);
const errorMessage = ref("");
const props = computed(() => options.value?.properties || []);
const isSave = computed(() => options.value?.mode === "save");
const allowFiles = computed(
  () => !isSave.value && (!props.value.length || props.value.includes("openFile")),
);
const allowDirectories = computed(() => !isSave.value && props.value.includes("openDirectory"));
const allowMultiple = computed(() => !isSave.value && props.value.includes("multiSelections"));
const canCreateDirectory = computed(
  () => props.value.includes("createDirectory") || props.value.includes("promptToCreate"),
);
const dialogTitle = computed(
  () =>
    options.value?.title ||
    (isSave.value
      ? "Save File"
      : allowDirectories.value && !allowFiles.value
        ? "Open Folder"
        : "Open File"),
);
const isAtRoot = computed(() => /^\/$|^[A-Za-z]:[\\/]?$/.test(currentPath.value));
const canConfirm = computed(() =>
  isSave.value ? !!saveFileName.value.trim() : selectedFiles.value.length > 0,
);
const selectedFiles = computed<FileItem[]>(() =>
  Array.isArray(selection.value) ? selection.value : selection.value ? [selection.value] : [],
);
const isWindows = () => /^[A-Za-z]:[\\/]/.test(currentPath.value);
const samePath = (left: string, right: string) =>
  left.replace(/[\\/]$/, "").toLowerCase() === right.replace(/[\\/]$/, "").toLowerCase();
const separator = () => (isWindows() ? "\\" : "/");
const joinPath = (base: string, name: string) =>
  base.endsWith("/") || base.endsWith("\\") ? base + name : base + separator() + name;
const parentPath = (path: string) => {
  const n = path.replace(/[\\/]$/, "");
  const i = Math.max(n.lastIndexOf("/"), n.lastIndexOf("\\"));
  if (i < 0) return "";
  if (i === 2 && /^[A-Za-z]:/.test(n)) return n.slice(0, 3);
  return n.slice(0, i) || (n.startsWith("/") ? "/" : "");
};
const matchesFilter = (name: string) => {
  const fs = options.value?.filters?.flatMap((f) => f.extensions) || [];
  if (!fs.length || fs.includes("*")) return true;
  return fs.some((e) => name.toLowerCase().endsWith("." + e.toLowerCase().replace(/^\./, "")));
};
const visibleFiles = computed(() =>
  files.value.filter(
    (f) =>
      (props.value.includes("showHiddenFiles") || !f.name.startsWith(".")) &&
      (f.isDirectory || isSave.value || matchesFilter(f.name)),
  ),
);
const loadDirectory = async () => {
  if (!currentPath.value) return;
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const r = await api.execute("fs:listDirectory", { path: currentPath.value });
    if (r.type === "success") {
      files.value = r.result.files;
      selection.value = null;
    } else errorMessage.value = r.ipcError || "Unable to list directory";
  } catch (e) {
    logger().error("Error loading directory:", e);
    errorMessage.value = e instanceof Error ? e.message : "Unable to list directory";
  } finally {
    isLoading.value = false;
  }
};
const goToHome = async () => {
  const r = await api.execute("fs:getHomeDirectory");
  if (r.type === "success") {
    currentPath.value = r.result.path;
    await loadDirectory();
  }
};
const navigateToRoot = async (path: string) => {
  currentPath.value = path;
  await loadDirectory();
};
const loadRoots = async () => {
  try {
    const r = await api.execute("fs:getRoots");
    if (r.type === "success") roots.value = r.result.roots;
  } catch (e) {
    logger().warn("Unable to load filesystem roots:", e);
  }
};
const goUp = async () => {
  const p = parentPath(currentPath.value);
  if (p && p !== currentPath.value) {
    currentPath.value = p;
    await loadDirectory();
  }
};
const onRowDblClick = async ({ data }: { data: FileItem }) => {
  if (data.isDirectory) {
    currentPath.value = joinPath(currentPath.value, data.name);
    await loadDirectory();
  } else if (!isSave.value && !allowDirectories.value) onConfirm();
};
const createDirectory = async () => {
  const name = window.prompt("New folder name");
  if (!name?.trim() || /[\\/]/.test(name)) return;
  const r = await api.execute("fs:createDirectory", {
    path: joinPath(currentPath.value, name.trim()),
  });
  if (r.type === "success") await loadDirectory();
  else errorMessage.value = r.ipcError || "Unable to create directory";
};
const ensureExtension = (name: string) => {
  const ext = options.value?.filters?.[0]?.extensions?.[0];
  return ext && ext !== "*" && !name.includes(".") ? name + "." + ext.replace(/^\./, "") : name;
};
const onConfirm = () => {
  if (!options.value) return;
  if (isSave.value) {
    const name = ensureExtension(saveFileName.value.trim());
    if (
      props.value.includes("showOverwriteConfirmation") &&
      files.value.some((f) => !f.isDirectory && f.name === name) &&
      !window.confirm("A file with this name already exists. Overwrite it?")
    )
      return;
    uiStore.resolveFilePicker({ canceled: false, filePath: joinPath(currentPath.value, name) });
  } else {
    const paths = selectedFiles.value
      .filter((f) => (f.isDirectory ? allowDirectories.value : allowFiles.value))
      .map((f) => joinPath(currentPath.value, f.name));
    if (paths.length) uiStore.resolveFilePicker({ canceled: false, filePaths: paths });
  }
};
const onCancel = () => uiStore.resolveFilePicker({ canceled: true });
const createInitialPath = (value: FilePickerOptions) => {
  const p = value.defaultPath;
  if (!p) return "";
  if (!/[\\/]$/.test(p)) {
    const parent = parentPath(p);
    if (value.mode === "save") saveFileName.value = parent ? p.slice(parent.length + 1) : p;
    if (parent) return parent;
    if (value.mode === "open") return p;
  }
  return p;
};
const initialize = async (value: FilePickerOptions | null) => {
  if (!value) return;
  selection.value = null;
  saveFileName.value = "";
  currentPath.value = createInitialPath(value);
  await loadRoots();
  if (!currentPath.value || (value.mode === "save" && !parentPath(value.defaultPath || "")))
    await goToHome();
  else await loadDirectory();
};
const getFileIcon = (f: FileItem) =>
  f.isDirectory
    ? "pi pi-folder text-primary"
    : f.isSymbolicLink
      ? "pi pi-link"
      : "pi pi-file text-600";
const formatSize = (b: number) =>
  b === 0
    ? "0 B"
    : `${parseFloat((b / Math.pow(1024, Math.floor(Math.log(b) / Math.log(1024)))).toFixed(2))} ${["B", "KB", "MB", "GB", "TB"][Math.floor(Math.log(b) / Math.log(1024))]}`;
const formatDate = (t: number) => (t ? new Date(t).toLocaleString() : "--");
watch(
  () => uiStore.isFilePickerVisible,
  (v) => {
    if (v) initialize(options.value);
  },
);
onMounted(() => {
  if (uiStore.isFilePickerVisible) initialize(options.value);
});
</script>
<style scoped>
.web-file-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.roots-sidebar {
  width: 12rem;
  overflow-y: auto;
}
.root-button {
  display: flex;
}
.root-button-active {
  background: var(--surface-200);
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
