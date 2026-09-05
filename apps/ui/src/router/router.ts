import { createRouter, createWebHistory, RouterOptions } from "vue-router";
import { i18n } from "../i18n";

const { t } = i18n.global;

const routes: RouterOptions["routes"] = [
  {
    path: "/",
    name: "Home",
    redirect: "Dashboard",
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
    path: "/plugins",
    name: "Plugins",
    component: () => import("../pages/plugins.vue"),
    meta: {
      title: "Plugins",
    },
  },
  {
    // Legacy path — the page used to live at /integrations.
    path: "/integrations",
    redirect: "/plugins",
  },
  {
    path: "/connections",
    name: "Connections",
    component: () => import("../pages/connections.vue"),
    meta: {
      title: "Connections",
    },
  },
  {
    path: "/scenarios",
    name: "Scenarios",
    component: () => import("../pages/scenarios.vue"),
    meta: {
      title: t("headers.pipelines"),
    },
    children: [],
  },
  {
    path: "/scenarios/editor/:pipelineId/:projectId",
    name: "Editor",
    component: () => import("../pages/editor.vue"),
    meta: {
      title: t("headers.editor"),
    },
  },
  {
    path: "/billing",
    name: "Billing",
    component: () => import("../pages/editor.vue"),
    meta: {
      title: t("headers.billing"),
    },
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
    path: "/paths",
    name: "Paths",
    component: () => import("../pages/paths.vue"),
    meta: {
      title: "Paths",
    },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
