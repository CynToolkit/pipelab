import { createRouter, createWebHashHistory, RouterOptions } from 'vue-router'

const routes: RouterOptions['routes'] = [
  {
    path: '/',
    name: 'Home',
    redirect: "Dashboard",
  },
  {
    path: '/dashboard',
    component: () => import('../pages/index.vue'),
    name: 'Dashboard',
  },
  {
    path: '/scenarios',
    name: 'Scenarios',
    component: () => import('../pages/scenarios.vue'),
    children: [

    ]
  },
  {
    path: '/scenarios/editor/:id',
    name: 'Editor',
    component: () => import('../pages/editor.vue'),
  },
  {
    path: '/billing',
    name: 'Billing',
    component: () => import('../pages/editor.vue'),
  },
  {
    path: '/team',
    name: 'Team',
    component: () => import('../pages/team.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
