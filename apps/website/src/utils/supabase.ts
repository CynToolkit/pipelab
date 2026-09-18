import { createClient } from '@supabase/supabase-js'
import { type Database } from '../database.types'

// ensure supabase env variables are available at build time
if (!__SUPABASE_URL__ || !__SUPABASE_ANON_KEY__) {
  throw new Error('Supabase environment variables are not configured.')
}

export const supabase = createClient<Database>(__SUPABASE_URL__, __SUPABASE_ANON_KEY__)
