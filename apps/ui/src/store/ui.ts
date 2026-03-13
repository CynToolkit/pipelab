import { defineStore } from "pinia";
import { ref } from "vue";

export interface FilePickerOptions {
  title?: string;
  defaultPath?: string;
  properties?: string[];
  filters?: { name: string; extensions: string[] }[];
  mode: "open" | "save";
}

export const useUIStore = defineStore("ui", () => {
  const isFilePickerVisible = ref(false);
  const filePickerOptions = ref<FilePickerOptions | null>(null);
  const filePickerResolve = ref<((value: any) => void) | null>(null);

  const showFilePicker = (
    options: FilePickerOptions,
  ): Promise<{ canceled: boolean; filePath?: string; filePaths?: string[] }> => {
    isFilePickerVisible.value = true;
    filePickerOptions.value = options;

    return new Promise((resolve) => {
      filePickerResolve.value = resolve;
    });
  };

  const resolveFilePicker = (result: {
    canceled: boolean;
    filePath?: string;
    filePaths?: string[];
  }) => {
    isFilePickerVisible.value = false;
    if (filePickerResolve.value) {
      filePickerResolve.value(result);
      filePickerResolve.value = null;
    }
  };

  return {
    isFilePickerVisible,
    filePickerOptions,
    showFilePicker,
    resolveFilePicker,
  };
});
