import { createRouter, createWebHashHistory, RouterOptions } from 'vue-router'
import { i18n } from '../i18n'

const { t } = i18n.global

const routes: RouterOptions['routes'] = [
  {
    path: '/',
    name: 'Home',
    redirect: 'Dashboard'
  },
  {
    path: '/dashboard',
    component: () => import('../pages/index.vue'),
    name: 'Dashboard',
    meta: {
      title: t('headers.dashboard')
    }
  },
  {
    path: '/scenarios',
    name: 'Scenarios',
    component: () => import('../pages/scenarios.vue'),
    meta: {
      title: t('headers.scenarios')
    },
    children: []
  },
  {
    path: '/scenarios/editor/:id',
    name: 'Editor',
    component: () => import('../pages/editor.vue'),
    meta: {
      title: t('headers.editor')
    }
  },
  {
    path: '/billing',
    name: 'Billing',
    component: () => import('../pages/editor.vue'),
    meta: {
      title: t('headers.billing')
    }
  },
  {
    path: '/team',
    name: 'Team',
    component: () => import('../pages/team.vue'),
    meta: {
      title: t('headers.team')
    }
  },
  {
    path: '/build-history',
    name: 'BuildHistory',
    component: () => import('../pages/BuildHistoryPage.vue'),
    meta: {
      title: 'Build History'
    }
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
