import { computed, ref, watch, type Ref } from "vue";
import type { ReleaseConfig, ReleasePlan } from "@pipelab/shared";
import type { useAPI } from "./api";
import { createSerializedTaskQueue } from "../pages/release-flow-model";
import { hasUnsavedReleaseWorkflowState } from "../pages/workflow-builds-state";

type Execute = ReturnType<typeof useAPI>["execute"];

export interface WorkflowDocumentDeps {
  flowId: Ref<string>;
  projectId: Ref<string>;
  /** The engine connection. Nothing is loaded, planned or saved while it is down. */
  isReady: Ref<boolean>;
  execute: Execute;
  /** A reason saving must be refused right now (for example an invalid environment name). */
  saveBlockedReason?: (flow: ReleaseConfig) => string | undefined;
  /** False while something a save depends on (connections, providers) has not loaded. */
  dataAvailable?: () => boolean;
}

export type WorkflowSaveState = "saving" | "saved" | "error";

export const SAVE_DELAY_MS = 700;
export const PLAN_DELAY_MS = 300;

// JSON, not structuredClone/toRaw: arrays rebuilt from reactive items keep nested proxies,
// which structuredClone rejects.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * One workflow, shared by every tab: the saved configuration being edited, its plan, and the
 * save queue. Pages edit `flow` directly; the document notices, plans and saves, so no page keeps
 * a copy that can drift from another's.
 */
export const createWorkflowDocument = (deps: WorkflowDocumentDeps) => {
  const { flowId, projectId, isReady, execute } = deps;

  const flow = ref<ReleaseConfig>();
  const plan = ref<ReleasePlan>();
  const planning = ref(false);
  const plannerError = ref("");
  const loading = ref(false);
  const loadError = ref("");
  const saveState = ref<WorkflowSaveState>("saved");
  const saveError = ref("");
  const changeRevision = ref(0);
  const persistedRevision = ref(0);

  const hasUnsaved = computed(() =>
    hasUnsavedReleaseWorkflowState({
      changeRevision: changeRevision.value,
      persistedRevision: persistedRevision.value,
      saveState: saveState.value,
    }),
  );

  let hydrating = false;
  let loadGeneration = 0;
  let saveGeneration = 0;
  let planGeneration = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let planTimer: ReturnType<typeof setTimeout> | undefined;
  const editListeners = new Set<() => void>();
  const planListeners = new Set<() => void>();

  /** Replace the configuration with one that is already saved. Not an edit. */
  const hydrate = (config: ReleaseConfig) => {
    hydrating = true;
    flow.value = config;
    hydrating = false;
    changeRevision.value = 0;
    persistedRevision.value = 0;
    saveState.value = "saved";
    saveError.value = "";
  };

  /**
   * Plan the current workflow. Resolves to the plan, or undefined if it failed or the workflow
   * was edited meanwhile (the newer edit schedules its own plan).
   */
  const refreshPlan = async (): Promise<ReleasePlan | undefined> => {
    if (!flow.value || !isReady.value) return undefined;
    const requestId = ++planGeneration;
    const revision = changeRevision.value;
    const config = clone(flow.value);
    const fingerprint = JSON.stringify(config);
    planning.value = true;
    plannerError.value = "";
    try {
      const result = await execute("release:plan", { config });
      if (
        requestId !== planGeneration ||
        revision !== changeRevision.value ||
        JSON.stringify(flow.value) !== fingerprint
      )
        return undefined;
      if (result.type === "error") {
        plan.value = undefined;
        plannerError.value = result.ipcError;
        return undefined;
      }
      plan.value = result.result;
      return result.result;
    } catch (cause) {
      if (requestId === planGeneration && revision === changeRevision.value) {
        plan.value = undefined;
        plannerError.value = cause instanceof Error ? cause.message : String(cause);
      }
      return undefined;
    } finally {
      if (requestId === planGeneration) {
        planning.value = false;
        for (const listener of planListeners) listener();
      }
    }
  };

  /** Resolves once no plan is being computed. */
  const planned = async () => {
    if (!planning.value) return;
    await new Promise<void>((resolve) => {
      const stop = watch(planning, (value) => {
        if (value) return;
        stop();
        resolve();
      });
    });
  };

  const save = createSerializedTaskQueue(async () => {
    if (!flow.value) return;
    const blocked = deps.saveBlockedReason?.(flow.value);
    if (blocked) {
      saveState.value = "error";
      saveError.value = blocked;
      throw new Error(blocked);
    }
    if (!isReady.value || deps.dataAvailable?.() === false) {
      if (!hasUnsaved.value) return;
      saveState.value = "error";
      saveError.value = "The engine or required workflow data is unavailable before save.";
      throw new Error(saveError.value);
    }
    const requestGeneration = ++saveGeneration;
    const revision = changeRevision.value;
    const snapshot = clone(flow.value);
    saveState.value = "saving";
    saveError.value = "";
    const result = await execute("workflow:save", {
      workflowId: snapshot.id,
      projectId: snapshot.project,
      data: snapshot,
    });
    if (requestGeneration !== saveGeneration || !isReady.value)
      throw new Error("The connection changed before the save could be confirmed.");
    if (result.type === "error") {
      saveState.value = "error";
      saveError.value = result.ipcError;
      throw new Error(result.ipcError);
    }
    persistedRevision.value = revision;
    // Edited again while saving: save the newer state too.
    if (
      persistedRevision.value !== changeRevision.value ||
      JSON.stringify(flow.value) !== JSON.stringify(snapshot)
    )
      void save().catch(() => {});
    else saveState.value = "saved";
  });

  /** Save what is pending now, rather than waiting for the debounce. Rejects if it cannot. */
  const flush = async () => {
    clearTimeout(saveTimer);
    if (!flow.value || !hasUnsaved.value) return;
    await save();
  };

  // Every edit, wherever it was made: count it, then plan and save once it settles.
  watch(
    flow,
    () => {
      if (hydrating || !flow.value) return;
      changeRevision.value += 1;
      planGeneration += 1;
      planning.value = true;
      clearTimeout(saveTimer);
      clearTimeout(planTimer);
      for (const listener of editListeners) listener();
      saveTimer = setTimeout(() => void save().catch(() => {}), SAVE_DELAY_MS);
      planTimer = setTimeout(() => void refreshPlan(), PLAN_DELAY_MS);
    },
    { deep: true, flush: "sync" },
  );

  /**
   * Fetch the saved workflow. Unsaved edits to the same workflow are kept. Switching to a
   * different workflow first saves whatever is pending for the old one.
   */
  const load = async (): Promise<{ ok: boolean; hydrated: boolean }> => {
    if (!isReady.value) return { ok: false, hydrated: false };
    const generation = ++loadGeneration;
    const requestedFlowId = flowId.value;
    const requestedProjectId = projectId.value;
    if (
      flow.value &&
      (flow.value.id !== requestedFlowId || flow.value.project !== requestedProjectId)
    ) {
      clearTimeout(planTimer);
      try {
        await flush();
      } catch {
        return { ok: false, hydrated: false };
      }
    }
    if (generation !== loadGeneration) return { ok: false, hydrated: false };
    loading.value = true;
    loadError.value = "";
    try {
      const result = await execute("workflow:load", {
        workflowId: requestedFlowId,
        projectId: requestedProjectId,
      });
      if (generation !== loadGeneration) return { ok: false, hydrated: false };
      if (result.type === "error") throw new Error(result.ipcError);
      if (result.result.id !== requestedFlowId || result.result.project !== requestedProjectId)
        throw new Error("Loaded workflow identity does not match the requested route.");
      const sameWorkflow =
        flow.value?.id === requestedFlowId && flow.value?.project === requestedProjectId;
      const keepDraft = sameWorkflow && hasUnsaved.value;
      if (!sameWorkflow) {
        plan.value = undefined;
        plannerError.value = "";
      }
      if (!keepDraft) hydrate(result.result);
      return { ok: true, hydrated: !keepDraft };
    } catch (cause) {
      if (generation === loadGeneration)
        loadError.value = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, hydrated: false };
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  };

  const isLoadedFor = () =>
    flow.value?.id === flowId.value && flow.value?.project === projectId.value;

  /** Resolves once this route's workflow is loaded: waits for a load in flight, or starts one. */
  const ensure = async (): Promise<boolean> => {
    if (loading.value) {
      await new Promise<void>((resolve) => {
        const stop = watch(loading, (value) => {
          if (value) return;
          stop();
          resolve();
        });
      });
    }
    return isLoadedFor() || (await load()).ok;
  };

  /**
   * Pick up what another tab saved, without a loading state. Skipped while there are unsaved
   * edits here. Re-plans only if the saved workflow actually differs.
   */
  const sync = async () => {
    if (!isReady.value || !flow.value || loading.value || hasUnsaved.value) return;
    const requestedFlowId = flowId.value;
    const requestedProjectId = projectId.value;
    const result = await execute("workflow:load", {
      workflowId: requestedFlowId,
      projectId: requestedProjectId,
    });
    if (
      result.type === "error" ||
      !flow.value ||
      hasUnsaved.value ||
      requestedFlowId !== flowId.value ||
      requestedProjectId !== projectId.value ||
      JSON.stringify(result.result) === JSON.stringify(flow.value)
    )
      return;
    hydrate(result.result);
    await refreshPlan();
  };

  // The engine going away invalidates everything in flight.
  watch(isReady, (ready) => {
    if (ready) return;
    loadGeneration++;
    saveGeneration++;
    planGeneration++;
    loading.value = false;
    planning.value = false;
    clearTimeout(saveTimer);
    clearTimeout(planTimer);
    if (hasUnsaved.value) {
      saveState.value = "error";
      saveError.value = "The engine disconnected before these workflow changes could be saved.";
    }
  });

  const onEdit = (listener: () => void) => {
    editListeners.add(listener);
    return () => editListeners.delete(listener);
  };
  const onPlanned = (listener: () => void) => {
    planListeners.add(listener);
    return () => planListeners.delete(listener);
  };
  const dispose = () => {
    clearTimeout(saveTimer);
    clearTimeout(planTimer);
    editListeners.clear();
    planListeners.clear();
  };

  return {
    flow,
    plan,
    planning,
    plannerError,
    loading,
    loadError,
    saveState,
    saveError,
    changeRevision,
    persistedRevision,
    hasUnsaved,
    hydrate,
    load,
    ensure,
    sync,
    refreshPlan,
    planned,
    save,
    flush,
    onEdit,
    onPlanned,
    dispose,
  };
};

export type WorkflowDocument = ReturnType<typeof createWorkflowDocument>;
