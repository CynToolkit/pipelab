<template>
  <Dialog
    v-model:visible="uiStore.isFilePickerVisible"
    class="file-picker-dialog"
    modal
    :header="dialogTitle"
    :style="{ width: '880px', maxWidth: '96vw', height: '640px', maxHeight: '92vh' }"
    :closable="true"
    @hide="onCancel"
  >
    <div class="web-file-picker">
      <Message v-if="errorMessage" severity="error">{{ errorMessage }}</Message>
      <Message v-if="options?.message" severity="info">{{ options.message }}</Message>
      <div class="picker-toolbar">
        <div class="toolbar-group">
          <Button
            v-tooltip.bottom="'Home'"
            icon="pi pi-home"
            text
            rounded
            severity="secondary"
            aria-label="Go to home folder"
            @click="goToHome"
          />
          <Button
            v-tooltip.bottom="'Parent folder'"
            icon="pi pi-arrow-up"
            text
            rounded
            severity="secondary"
            aria-label="Go to parent folder"
            :disabled="isAtRoot"
            @click="goUp"
          />
        </div>
        <div class="path-field">
          <i class="pi pi-folder-open path-icon" aria-hidden="true" />
          <InputText
            v-model="currentPath"
            class="path-input"
            aria-label="Current folder"
            spellcheck="false"
            @keydown.enter="loadDirectory"
          />
        </div>
        <div class="toolbar-group">
          <Button
            v-if="canCreateDirectory"
            v-tooltip.bottom="'New folder'"
            icon="pi pi-folder-plus"
            text
            rounded
            severity="secondary"
            aria-label="Create folder"
            @click="startCreateDirectory"
          />
          <Button
            v-tooltip.bottom="'Refresh'"
            icon="pi pi-refresh"
            text
            rounded
            severity="secondary"
            aria-label="Refresh"
            @click="loadDirectory"
          />
        </div>
      </div>
      <div v-if="creatingDirectory" class="new-folder-row">
        <InputText
          v-model="newDirectoryName"
          class="path-input"
          aria-label="New folder name"
          placeholder="New folder name"
          spellcheck="false"
          autofocus
          @keydown.enter="createDirectory"
          @keydown.esc="creatingDirectory = false"
        />
        <Button label="Create" size="small" :disabled="!newDirectoryName.trim()" @click="createDirectory" />
        <Button label="Cancel" size="small" text severity="secondary" @click="creatingDirectory = false" />
      </div>
      <div class="picker-body">
        <nav class="roots-sidebar" aria-label="Locations">
          <span class="roots-title">Locations</span>
          <button
            v-for="root in roots"
            :key="root.path"
            type="button"
            class="root-item"
            :class="{ active: samePath(root.path, currentPath) }"
            :aria-current="samePath(root.path, currentPath) ? 'true' : undefined"
            @click="navigateToRoot(root.path)"
          >
            <i :class="root.name === 'Home' ? 'pi pi-home' : 'pi pi-database'" aria-hidden="true" />
            <span>{{ root.name }}</span>
          </button>
        </nav>
        <div class="file-list-container">
          <DataTable
            :value="visibleFiles"
            v-model:selection="selection"
            :selectionMode="allowMultiple ? 'multiple' : 'single'"
            dataKey="name"
            class="file-table"
            scrollable
            scrollHeight="flex"
            @row-dblclick="onRowDblClick"
            :loading="isLoading"
          >
            <template #empty>
              <div class="file-empty"><i class="pi pi-folder-open" />This folder is empty</div>
            </template>
            <Column v-if="allowMultiple" selectionMode="multiple" headerStyle="width: 3rem" />
            <Column field="name" header="Name" sortable
              ><template #body="{ data }"
                ><div class="file-name">
                  <i :class="getFileIcon(data)" /><span>{{ data.name }}</span>
                </div></template
              ></Column
            >
            <Column field="size" header="Size" sortable headerStyle="width: 7rem"
              ><template #body="{ data }"
                ><span class="file-meta">{{
                  data.isDirectory ? "—" : formatSize(data.size)
                }}</span></template
              ></Column
            >
            <Column field="mtime" header="Modified" sortable headerStyle="width: 12rem"
              ><template #body="{ data }"
                ><span class="file-meta">{{ formatDate(data.mtime) }}</span></template
              ></Column
            >
          </DataTable>
        </div>
      </div>
      <div class="picker-footer">
        <div class="selected-name">
          <template v-if="isSave">
            <label for="file-picker-name">{{ options?.nameFieldLabel || "File name" }}</label>
            <InputText
              id="file-picker-name"
              v-model="saveFileName"
              class="w-full"
              @keydown.enter="onConfirm"
            />
          </template>
          <span v-else class="selection-summary" :class="{ empty: !selectedFiles.length }">
            {{
              selectedFiles.length
                ? selectedFiles.map((f) => f.name).join(", ")
                : "No file selected"
            }}
          </span>
        </div>
        <div class="actions">
          <Button label="Cancel" text severity="secondary" @click="onCancel" />
          <Button
            :label="options?.buttonLabel || (isSave ? 'Save' : 'Open')"
            :disabled="!canConfirm"
            @click="onConfirm"
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
const creatingDirectory = ref(false);
const newDirectoryName = ref("");
const startCreateDirectory = () => {
  newDirectoryName.value = "";
  creatingDirectory.value = true;
};
const createDirectory = async () => {
  const name = newDirectoryName.value.trim();
  if (!name) return;
  if (/[\\/]/.test(name)) {
    errorMessage.value = "Folder names cannot contain slashes.";
    return;
  }
  const r = await api.execute("fs:createDirectory", {
    path: joinPath(currentPath.value, name),
  });
  if (r.type === "success") {
    creatingDirectory.value = false;
    await loadDirectory();
  }
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
  f.isDirectory ? "pi pi-folder is-folder" : f.isSymbolicLink ? "pi pi-link" : "pi pi-file";
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
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.new-folder-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.new-folder-row .path-input {
  flex: 1;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.path-field {
  position: relative;
  flex: 1;
  min-width: 0;
}
.path-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  color: var(--pl-muted);
  font-size: 0.95rem;
  pointer-events: none;
  transform: translateY(-50%);
}
.path-input {
  width: 100%;
  padding-left: 2.4rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
}
.picker-body {
  display: flex;
  flex: 1;
  gap: 14px;
  min-height: 0;
}
.roots-sidebar {
  display: flex;
  flex: 0 0 11.5rem;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  overflow-y: auto;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-sunken);
}
.roots-title {
  padding: 2px 8px 8px;
  color: var(--pl-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.root-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--pl-radius-sm);
  background: transparent;
  color: var(--pl-muted);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s var(--pl-ease),
    color 0.15s var(--pl-ease);
}
.root-item i {
  font-size: 0.95rem;
}
.root-item:hover {
  background: var(--pl-hover);
  color: var(--p-text-color);
}
.root-item:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
.root-item.active {
  background: var(--pl-card);
  color: var(--p-text-color);
  font-weight: 600;
  box-shadow:
    0 0 0 1px var(--pl-border),
    var(--pl-shadow-xs);
}
.root-item.active i {
  color: var(--pl-accent);
}
.file-list-container {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
}
.file-table {
  flex: 1;
  min-height: 0;
}
.file-table :deep(.p-datatable-table-container) {
  height: 100%;
}
.file-table :deep(.p-datatable-thead > tr > th) {
  padding: 10px 14px;
  border-bottom: 1px solid var(--pl-border);
  background: var(--pl-sunken);
  color: var(--pl-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.file-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
  transition: background 0.12s var(--pl-ease);
}
.file-table :deep(.p-datatable-tbody > tr > td) {
  padding: 9px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--pl-border) 55%, transparent);
  font-size: 0.86rem;
}
.file-table :deep(.p-datatable-tbody > tr:hover) {
  background: var(--pl-hover);
}
.file-table :deep(.p-datatable-tbody > tr.p-datatable-row-selected) {
  background: color-mix(in srgb, var(--pl-accent) 9%, var(--pl-card));
  color: var(--p-text-color);
}
.file-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.file-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-name i {
  flex: 0 0 auto;
  color: var(--pl-muted);
  font-size: 1rem;
}
.file-name i.is-folder {
  color: var(--pl-accent);
}
.file-meta {
  color: var(--pl-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.file-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 56px 16px;
  color: var(--pl-muted);
  font-size: 0.86rem;
}
.file-empty i {
  font-size: 1.6rem;
  opacity: 0.6;
}
.picker-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--pl-border);
}
.selected-name {
  display: grid;
  flex: 1;
  gap: 6px;
  min-width: 0;
}
.selected-name label {
  font-size: 0.78rem;
  font-weight: 600;
}
.selection-summary {
  overflow: hidden;
  color: var(--p-text-color);
  font-size: 0.86rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-summary.empty {
  color: var(--pl-muted);
  font-weight: 400;
}
.actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
</style>
