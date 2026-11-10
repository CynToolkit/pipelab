import {
  computed,
  inject,
  onActivated,
  onDeactivated,
  ref,
  type InjectionKey,
  type Ref,
} from "vue";

/**
 * The header's actions slot, provided by the layout once it is in the document. Pages teleport
 * their buttons into it. A resolved element is used instead of a selector with `defer`: Vue
 * 3.5's deferred Teleport throws and loops if its page is swapped out before it has mounted.
 */
export const workflowActionsKey: InjectionKey<Ref<HTMLElement | undefined>> =
  Symbol("workflow-header-actions");

/**
 * For a workflow tab page the layout keeps alive. Returns the header element to teleport the
 * page's buttons into (undefined while the page is cached, so its buttons leave the header),
 * and runs `onReactivated` each time the tab is shown again after the first.
 */
export const useWorkflowTab = (onReactivated: () => void) => {
  const header = inject(workflowActionsKey, ref<HTMLElement>());
  const active = ref(true);
  let first = true;
  onActivated(() => {
    active.value = true;
    if (first) first = false;
    else onReactivated();
  });
  onDeactivated(() => {
    active.value = false;
  });
  return computed(() => (active.value ? header.value : undefined));
};
