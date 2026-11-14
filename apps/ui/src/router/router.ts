import { createRouter, createWebHistory, RouterOptions } from "vue-router";
import { i18n } from "../i18n";
import { preserveDesktopCliPort } from "./preserve-desktop-cli-port";

const { t } = i18n.global;

const routes: RouterOptions["routes"] = [
  {
    path: "/",
    name: "Home",
    redirect: { name: "Dashboard" },
  },
  {
    path: "/dashboard",
    component: () => import("../pages/index.vue"),
    name: "Dashboard",
    meta: {
      title: t("headers.dashboard"),
    },
  },
  {
    path: "/auth/callback",
    name: "AuthCallback",
    component: () => import("../pages/auth-callback.vue"),
    meta: { title: "Account verification" },
  },
  { path: "/plugins", redirect: "/connections" },
  { path: "/integrations", redirect: "/connections" },
  {
    path: "/connections/:connectionId?",
    name: "Connections",
    component: () => import("../pages/connections.vue"),
    meta: {
      title: "Connections",
    },
  },
  {
    path: "/cloud-files",
    name: "CloudFiles",
    component: () => import("../pages/cloud-files.vue"),
    meta: { title: "Cloud files" },
  },
  {
    path: "/team",
    name: "Team",
    component: () => import("../pages/team.vue"),
    meta: {
      title: t("headers.team"),
    },
  },
  {
    path: "/workflows",
    name: "Workflows",
    component: () => import("../pages/workflows.vue"),
    meta: { title: t("home.workflows") },
  },
  {
    // One layout owns the header, so switching tabs never remounts it.
    path: "/workflows/:flowId/:projectId",
    component: () => import("../components/WorkflowLayout.vue"),
    children: [
      {
        path: "",
        name: "Workflow",
        component: () => import("../pages/release-flow.vue"),
        meta: { title: "Workflow" },
      },
      {
        // Opens one deployment's settings on the configuration tab; used by a failed run's Fix.
        path: "deployments/:destinationId",
        name: "WorkflowDestination",
        component: () => import("../pages/release-flow.vue"),
        meta: { title: "Workflow" },
      },
      {
        path: "deployments/:destinationId/:slotId",
        name: "WorkflowDeployment",
        component: () => import("../pages/release-flow.vue"),
        meta: { title: "Workflow" },
      },
      {
        path: "builds",
        name: "WorkflowBuilds",
        component: () => import("../pages/workflow-builds.vue"),
        meta: { title: "Builds" },
      },
      {
        path: "artifacts",
        name: "WorkflowArtifacts",
        component: () => import("../pages/workflow-artifacts.vue"),
        meta: { title: "Artifacts" },
      },
      {
        path: "plan",
        name: "WorkflowPlan",
        component: () => import("../pages/workflow-plan.vue"),
        meta: { title: "Plan" },
      },
      {
        path: "settings",
        name: "WorkflowSettings",
        component: () => import("../pages/workflow-settings.vue"),
        meta: { title: "Settings" },
      },
      {
        path: "runs",
        name: "WorkflowRuns",
        component: () => import("../pages/workflow-runs.vue"),
        meta: { title: "Runs" },
      },
      {
        path: "runs/:runId",
        name: "WorkflowRunDetail",
        component: () => import("../pages/run-detail.vue"),
        meta: { title: "Run" },
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(preserveDesktopCliPort);
