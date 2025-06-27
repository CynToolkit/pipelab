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
    meta: {
      title: 'Dashboard'
    }
  },
  {
    path: '/scenarios',
    name: 'Scenarios',
    component: () => import('../pages/scenarios.vue'),
    meta: {
      title: 'Scenarios'
    },
    children: [

    ]
  },
  {
    path: '/scenarios/editor/:id',
    name: 'Editor',
    component: () => import('../pages/editor.vue'),
    meta: {
      title: 'Editor'
    }
  },
  {
    path: '/billing',
    name: 'Billing',
    component: () => import('../pages/editor.vue'),
    meta: {
      title: 'Billing'
    }
  },
  {
    path: '/team',
    name: 'Team',
    component: () => import('../pages/team.vue'),
    meta: {
      title: 'Team'
    }
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
