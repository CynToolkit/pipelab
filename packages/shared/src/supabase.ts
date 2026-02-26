import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

let _isSupabaseAvailable = true
// ensure supabase env variables are available at build time
if (!__SUPABASE_URL__ || !__SUPABASE_ANON_KEY__) {
  console.warn('Supabase environment variables are not configured.')
  _isSupabaseAvailable = false
}

export const supabase = () => createClient<Database>(__SUPABASE_URL__, __SUPABASE_ANON_KEY__)
export const isSupabaseAvailable = _isSupabaseAvailable
