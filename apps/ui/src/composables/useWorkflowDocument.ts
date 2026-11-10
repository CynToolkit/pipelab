import { computed, inject, onScopeDispose, provide, type InjectionKey, type Ref } from "vue";
import { useAgentAvailability } from "./useAgentAvailability";
import { useAPI } from "./api";
import { useAppStore } from "../store/app";
import { useConnectionsStore } from "../store/connections";
import { invalidEnvironmentBindingPaths } from "../utils/environment-bindings";
import { createWorkflowDocument, type WorkflowDocument } from "./workflow-document";

const workflowDocumentKey: InjectionKey<WorkflowDocument> = Symbol("workflow-document");

const create = (ids: { flowId: Ref<string>; projectId: Ref<string> }) => {
  const agent = useAgentAvailability();
  const api = useAPI();
  const appStore = useAppStore();
  const connectionsStore = useConnectionsStore();
  const document = createWorkflowDocument({
    flowId: ids.flowId,
    projectId: ids.projectId,
    isReady: computed(() => agent.isReady.value),
    execute: api.execute,
    saveBlockedReason: (flow) =>
      invalidEnvironmentBindingPaths(flow).length > 0
        ? "Fix invalid environment variable names before saving workflow changes."
        : undefined,
    dataAvailable: () => connectionsStore.status === "ready" && appStore.providerStatus === "ready",
  });
  onScopeDispose(document.dispose);
  return document;
};

/** The layout owns the workflow and shares it with every tab. */
export const provideWorkflowDocument = (ids: { flowId: Ref<string>; projectId: Ref<string> }) => {
  const document = create(ids);
  provide(workflowDocumentKey, document);
  return document;
};

/**
 * The shared workflow. Outside the layout (the dashboard's Ship dialog embeds the editor
 * page on its own) there is nothing to share, so the page gets its own.
 */
export const useWorkflowDocument = (ids: { flowId: Ref<string>; projectId: Ref<string> }) =>
  inject(workflowDocumentKey, undefined) ?? create(ids);
