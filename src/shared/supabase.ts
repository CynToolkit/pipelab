import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

export const supabase = createClient<Database>(
  __SUPABASE_URL__,
  __SUPABASE_ANON_KEY__
)
