/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string
declare const __SUPABASE_PROJECT_ID__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
